using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LedController.Models;

namespace LedController.Services;

/// <summary>
/// Thin HTTP client for the youdo-v2 API's device-facing endpoints
/// (apps/api/src/routes/devices.ts). Pairing has no auth (the pairing code
/// itself is the one-time secret); everything else sends the long-lived
/// deviceAuth JWT via the x-device-auth header, mirroring the client portal's
/// x-client-auth pattern (apps/api/src/routes/client.ts).
/// </summary>
public class ApiClient
{
    private readonly HttpClient _http;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ApiClient(string apiBaseUrl)
    {
        _http = new HttpClient { BaseAddress = new Uri(apiBaseUrl.TrimEnd('/') + "/") };
    }

    public async Task<PairResponse> PairAsync(string pairingCode, CancellationToken ct = default)
    {
        var res = await _http.PostAsJsonAsync("api/v2/devices/pair", new { pairingCode }, JsonOptions, ct);
        await EnsureSuccess(res, ct);
        return (await res.Content.ReadFromJsonAsync<PairResponse>(JsonOptions, ct))!;
    }

    public async Task<SyncResponse> SyncAsync(string deviceAuth, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "api/v2/devices/sync");
        req.Headers.Add("x-device-auth", deviceAuth);
        var res = await _http.SendAsync(req, ct);
        await EnsureSuccess(res, ct);
        return (await res.Content.ReadFromJsonAsync<SyncResponse>(JsonOptions, ct))!;
    }

    public async Task<DownloadUrlResponse> GetMediaDownloadUrlAsync(string deviceAuth, string assetId, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/v2/devices/media/{assetId}/download");
        req.Headers.Add("x-device-auth", deviceAuth);
        var res = await _http.SendAsync(req, ct);
        await EnsureSuccess(res, ct);
        return (await res.Content.ReadFromJsonAsync<DownloadUrlResponse>(JsonOptions, ct))!;
    }

    /// <summary>Public, no auth header needed — the app checks this on every startup,
    /// even before it has a paired session (mirrors PairAsync's public design). Sistemas →
    /// Downloads now lists releases for multiple desktop apps, so this is explicit about
    /// which one it is instead of relying on the server's "led-controller" default.</summary>
    public async Task<LatestVersionResponse> GetLatestVersionAsync(CancellationToken ct = default)
    {
        var res = await _http.GetAsync("api/v2/devices/latest-version?system=led-controller", ct);
        await EnsureSuccess(res, ct);
        return (await res.Content.ReadFromJsonAsync<LatestVersionResponse>(JsonOptions, ct))!;
    }

    public async Task HeartbeatAsync(string deviceAuth, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "api/v2/devices/heartbeat");
        req.Headers.Add("x-device-auth", deviceAuth);
        var res = await _http.SendAsync(req, ct);
        await EnsureSuccess(res, ct);
    }

    /// <summary>Downloads a media asset's bytes directly (presigned S3 URL, once the
    /// download endpoint from Phase 2 exists) to the given destination path.</summary>
    public async Task DownloadToFileAsync(string url, string destinationPath, CancellationToken ct = default)
    {
        using var res = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        res.EnsureSuccessStatusCode();
        await using var fileStream = File.Create(destinationPath);
        await res.Content.CopyToAsync(fileStream, ct);
    }

    private static async Task EnsureSuccess(HttpResponseMessage res, CancellationToken ct)
    {
        if (res.IsSuccessStatusCode) return;
        string message = $"HTTP {(int)res.StatusCode}";
        try
        {
            var err = await res.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions, ct);
            if (!string.IsNullOrEmpty(err?.Error)) message = err!.Error!;
        }
        catch { /* body wasn't JSON — keep the generic status message */ }
        throw new ApiException(res.StatusCode, message);
    }
}

public class ApiException : Exception
{
    public System.Net.HttpStatusCode StatusCode { get; }
    public ApiException(System.Net.HttpStatusCode statusCode, string message) : base(message)
    {
        StatusCode = statusCode;
    }
}
