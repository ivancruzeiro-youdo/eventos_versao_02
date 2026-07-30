using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LedController.Services;

/// <summary>
/// Persists the device's pairing (API base URL + long-lived deviceAuth JWT) to
/// %LOCALAPPDATA%\YouDoLedController\config.json, with the JWT encrypted at rest
/// via Windows DPAPI (CurrentUser scope) so it isn't sitting in plaintext on disk.
/// </summary>
public class DeviceConfig
{
    public string ApiBaseUrl { get; set; } = "";
    public string VenueId { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public string EncryptedDeviceAuth { get; set; } = "";
}

public static class DeviceConfigStore
{
    private static readonly string ConfigDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "YouDoLedController");

    private static readonly string ConfigPath = Path.Combine(ConfigDir, "config.json");

    public static DeviceConfig? Load()
    {
        if (!File.Exists(ConfigPath)) return null;
        try
        {
            var json = File.ReadAllText(ConfigPath);
            return JsonSerializer.Deserialize<DeviceConfig>(json);
        }
        catch
        {
            return null; // corrupted config — treat as unpaired, user re-pairs
        }
    }

    public static string? DecryptDeviceAuth(DeviceConfig config)
    {
        if (string.IsNullOrEmpty(config.EncryptedDeviceAuth)) return null;
        try
        {
            var encryptedBytes = Convert.FromBase64String(config.EncryptedDeviceAuth);
            var plainBytes = ProtectedData.Unprotect(encryptedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plainBytes);
        }
        catch
        {
            return null;
        }
    }

    public static void Save(string apiBaseUrl, string venueId, string deviceName, string deviceAuth)
    {
        Directory.CreateDirectory(ConfigDir);
        var plainBytes = Encoding.UTF8.GetBytes(deviceAuth);
        var encryptedBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);

        var config = new DeviceConfig
        {
            ApiBaseUrl = apiBaseUrl,
            VenueId = venueId,
            DeviceName = deviceName,
            EncryptedDeviceAuth = Convert.ToBase64String(encryptedBytes),
        };

        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(config));
    }

    public static void Clear()
    {
        if (File.Exists(ConfigPath)) File.Delete(ConfigPath);
    }

    /// <summary>Local cache folder for downloaded media, keyed by asset id.</summary>
    public static string MediaCacheDir
    {
        get
        {
            var dir = Path.Combine(ConfigDir, "cache");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    /// <summary>Local manifest of what's already downloaded (assetId -> checksum), so
    /// re-sync only pulls new/changed files instead of re-downloading everything.</summary>
    public static string ManifestPath => Path.Combine(ConfigDir, "manifest.json");
}
