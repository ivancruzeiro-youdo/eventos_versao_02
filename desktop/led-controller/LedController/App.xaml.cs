using System.Windows;
using System.Windows.Forms;
using LedController.Services;
using LedController.Views;
using Application = System.Windows.Application;

namespace LedController;

public partial class App : Application
{
    private MediaSyncService? _syncService;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var config = DeviceConfigStore.Load();
        var deviceAuth = config != null ? DeviceConfigStore.DecryptDeviceAuth(config) : null;

        if (config == null || deviceAuth == null)
        {
            // Not paired (or the saved token couldn't be decrypted, e.g. moved to another
            // machine/user account) — show the pairing screen and stop here.
            var pairing = new PairingWindow();
            pairing.Show();
            return;
        }

        StartPairedSession(config.ApiBaseUrl, deviceAuth, config.DeviceName);
    }

    private void StartPairedSession(string apiBaseUrl, string deviceAuth, string deviceName)
    {
        var api = new ApiClient(apiBaseUrl);
        _syncService = new MediaSyncService(api, deviceAuth, TimeSpan.FromMinutes(2));

        var display = new DisplayWindow();
        var control = new ControlWindow(display, _syncService, deviceName);

        var screens = Screen.AllScreens;
        if (screens.Length >= 2)
        {
            // Primary monitor: operator control UI. Secondary: the LED panel.
            var secondary = screens.FirstOrDefault(s => !s.Primary) ?? screens[1];
            display.PlaceOnScreen(secondary);
        }
        else
        {
            // Single-monitor dev/test setup: still show both windows so the control
            // flow can be exercised, just without real fullscreen separation.
            display.Width = 640;
            display.Height = 360;
            display.WindowStyle = WindowStyle.SingleBorderWindow;
            display.Topmost = false;
        }

        display.Show();
        display.ShowIdle();
        control.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _syncService?.Dispose();
        base.OnExit(e);
    }
}
