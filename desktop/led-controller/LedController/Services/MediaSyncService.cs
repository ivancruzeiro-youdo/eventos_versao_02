using System.IO;
using System.Text.Json;
using LedController.Models;

namespace LedController.Services;

/// <summary>
/// Periodically pulls GET /devices/sync and keeps the local media cache up to date.
/// Playback (see ControlWindow/DisplayWindow) only ever reads from the local cache,
/// never the network — this is what makes the show run offline once synced.
///
/// NOTE (Phase 1 -> Phase 2 handoff): the API's /devices/sync currently returns each
/// asset's metadata (id, checksum, sizeBytes, ...) but Phase 1 has no upload pipeline
/// yet, so there's nothing to download. The per-asset download endpoint
/// (GET /devices/media/:assetId/download -> presigned URL) is Phase 2 work; once it
/// exists, wire its URL into DownloadMissingAsync below instead of the TODO.
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

                // TODO (Phase 2): fetch the real presigned download URL from
                // GET /devices/media/{asset.Id}/download and download it here:
                // var destPath = Path.Combine(DeviceConfigStore.MediaCacheDir, asset.Id);
                // await _api.DownloadToFileAsync(downloadUrl, destPath);
                _manifest[asset.Id] = asset.Checksum;
            }
        }

        // Clean up cached files for assets no longer referenced by any upcoming event.
        foreach (var staleId in _manifest.Keys.Except(neededIds).ToList())
        {
            var path = Path.Combine(DeviceConfigStore.MediaCacheDir, staleId);
            if (File.Exists(path)) File.Delete(path);
            _manifest.Remove(staleId);
        }

        SaveManifest();
    }

    public string GetCachedPath(string assetId) => Path.Combine(DeviceConfigStore.MediaCacheDir, assetId);

    public bool IsCached(string assetId) => File.Exists(GetCachedPath(assetId));

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
