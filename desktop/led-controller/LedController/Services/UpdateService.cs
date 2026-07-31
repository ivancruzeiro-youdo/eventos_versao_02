using System.Diagnostics;
using System.Reflection;

namespace LedController.Services;

/// <summary>
/// Checks GET /devices/latest-version on every startup and, if a newer build is
/// published, downloads it and self-replaces the running .exe. Deliberately dumb/robust:
/// any failure here (offline, S3 hiccup, malformed version) just skips the update for
/// this run — it must never be the reason the app fails to start.
///
/// Self-replace only works when running the published single-file .exe (see the
/// `dotnet publish -p:PublishSingleFile=true -r win-x64 --self-contained true` command
/// in README.md) — under `dotnet run` the "current exe" is dotnet.exe itself, so the
/// update is skipped there by design (CurrentExePath returns null).
/// </summary>
public static class UpdateService
{
    /// <summary>Returns true if an update was staged and the caller should exit
    /// immediately (a relaunch script is already scheduled).</summary>
    public static async Task<bool> CheckAndApplyAsync(string apiBaseUrl)
    {
        try
        {
            var currentExePath = GetCurrentExePath();
            if (currentExePath == null) return false; // dev run (dotnet run) — nothing to replace

            var api = new ApiClient(apiBaseUrl);
            var latest = await api.GetLatestVersionAsync();
            if (string.IsNullOrEmpty(latest.Version) || string.IsNullOrEmpty(latest.DownloadUrl)) return false;

            if (!Version.TryParse(NormalizeVersion(latest.Version), out var serverVersion)) return false;
            var currentVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0, 0);
            if (serverVersion <= currentVersion) return false; // already up to date

            var tempExePath = Path.Combine(Path.GetTempPath(), $"YouDoLedController-{latest.Version}.exe");
            await api.DownloadToFileAsync(latest.DownloadUrl!, tempExePath);

            StageSelfReplace(currentExePath, tempExePath);
            return true;
        }
        catch
        {
            return false;
        }
    }

    // "1.2" -> "1.2.0.0", "1.2.3" -> "1.2.3.0" — System.Version needs at least 2 parts,
    // and DesktopRelease.version is stored as a free-form string by the admin.
    private static string NormalizeVersion(string version)
    {
        var parts = version.Split('.');
        return parts.Length switch
        {
            1 => $"{version}.0.0.0",
            2 => $"{version}.0.0",
            3 => $"{version}.0",
            _ => version,
        };
    }

    private static string? GetCurrentExePath()
    {
        var path = Process.GetCurrentProcess().MainModule?.FileName;
        if (string.IsNullOrEmpty(path)) return null;
        // Under `dotnet run`/`dotnet build` the running process is dotnet.exe, not our app —
        // self-replacing that would be catastrophic, so bail out explicitly.
        if (Path.GetFileNameWithoutExtension(path).Equals("dotnet", StringComparison.OrdinalIgnoreCase)) return null;
        return path;
    }

    // Windows locks a running .exe, so the swap has to happen from a separate process
    // *after* this one exits: a tiny batch script waits, copies the new file over the
    // old one, relaunches, then deletes itself.
    private static void StageSelfReplace(string currentExePath, string newExePath)
    {
        var scriptPath = Path.Combine(Path.GetTempPath(), $"youdo-update-{Guid.NewGuid():N}.bat");
        var script =
            "@echo off\r\n" +
            "timeout /t 2 /nobreak >nul\r\n" +
            $"copy /y \"{newExePath}\" \"{currentExePath}\" >nul\r\n" +
            $"del \"{newExePath}\" >nul\r\n" +
            $"start \"\" \"{currentExePath}\"\r\n" +
            $"del \"%~f0\"\r\n";
        File.WriteAllText(scriptPath, script);

        Process.Start(new ProcessStartInfo
        {
            FileName = scriptPath,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            CreateNoWindow = true,
        });
    }
}
