using System.IO;
using System.Text.Json;
using LedController.Models;
using Timer = System.Threading.Timer;

namespace LedController.Services;

/// <summary>
/// Periodically pulls GET /devices/sync and keeps the local media cache up to date.
/// Playback (see ControlWindow/DisplayWindow) only ever reads from the local cache,
/// never the network — this is what makes the show run offline once synced.
/// </summary>
public class MediaSyncService : IDisposable
{
    private readonly ApiClient _api;
    private readonly string _deviceAuth;
    private readonly Timer _timer;
    private Dictionary<string, string> _manifest; // assetId -> checksum already on disk

    public event Action<SyncResponse>? Synced;
    public event Action<Exception>? SyncFailed;

    public MediaSyncService(ApiClient api, string deviceAuth, TimeSpan interval)
    {
        _api = api;
        _deviceAuth = deviceAuth;
        _manifest = LoadManifest();
        _timer = new Timer(async _ => await SafeSyncOnce(), null, TimeSpan.Zero, interval);
    }

    public async Task SafeSyncOnce()
    {
        try
        {
            var result = await _api.SyncAsync(_deviceAuth);
            await ReconcileAsync(result);
            await _api.HeartbeatAsync(_deviceAuth);
            Synced?.Invoke(result);
        }
        catch (Exception ex)
        {
            // Offline-first: a failed sync is not fatal — whatever was already
            // downloaded on a previous successful sync keeps working.
            SyncFailed?.Invoke(ex);
        }
    }

    private async Task ReconcileAsync(SyncResponse result)
    {
        var neededIds = new HashSet<string>();
        foreach (var ev in result.Events)
        {
            foreach (var asset in ev.MediaAssets)
            {
                neededIds.Add(asset.Id);
                if (_manifest.TryGetValue(asset.Id, out var cachedChecksum) && cachedChecksum == asset.Checksum)
                    continue; // already have the current version

                try
                {
                    var download = await _api.GetMediaDownloadUrlAsync(_deviceAuth, asset.Id);
                    var destPath = GetCachedPath(asset);
                    await _api.DownloadToFileAsync(download.DownloadUrl, destPath);
                    _manifest[asset.Id] = asset.Checksum;
                }
                catch
                {
                    // Leave this asset out of the manifest — it'll be retried on the next
                    // sync tick instead of silently marking a failed download as cached.
                }
            }
        }

        // Clean up cached files for assets no longer referenced by any upcoming event.
        // Match by id prefix since the cached filename carries a mime-derived extension.
        foreach (var staleId in _manifest.Keys.Except(neededIds).ToList())
        {
            foreach (var file in Directory.GetFiles(DeviceConfigStore.MediaCacheDir, staleId + ".*"))
                File.Delete(file);
            _manifest.Remove(staleId);
        }

        SaveManifest();
    }

    // MediaElement (Media Foundation) picks its decoder from the local file's extension,
    // not by sniffing content — a cached file saved without one silently fails to play
    // (shows as a black/blank panel with no error), so the cache filename must carry it.
    public string GetCachedPath(MediaAssetDto asset) =>
        Path.Combine(DeviceConfigStore.MediaCacheDir, asset.Id + ExtensionForMimeType(asset.MimeType));

    public bool IsCached(MediaAssetDto asset) => File.Exists(GetCachedPath(asset));

    private static string ExtensionForMimeType(string mimeType) => mimeType switch
    {
        "video/mp4" => ".mp4",
        "video/webm" => ".webm",
        "video/quicktime" => ".mov",
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/gif" => ".gif",
        "audio/mpeg" => ".mp3",
        "audio/wav" => ".wav",
        _ => "",
    };

    private static Dictionary<string, string> LoadManifest()
    {
        try
        {
            if (!File.Exists(DeviceConfigStore.ManifestPath)) return new();
            var json = File.ReadAllText(DeviceConfigStore.ManifestPath);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new();
        }
        catch
        {
            return new();
        }
    }

    private void SaveManifest()
    {
        File.WriteAllText(DeviceConfigStore.ManifestPath, JsonSerializer.Serialize(_manifest));
    }

    public void Dispose() => _timer.Dispose();
}
