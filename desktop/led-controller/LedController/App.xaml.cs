using System.Windows;
using System.Windows.Forms;
using LedController.Services;
using LedController.Views;
using Application = System.Windows.Application;

namespace LedController;

public partial class App : Application
{
    private MediaSyncService? _syncService;

    protected override async void OnStartup(StartupEventArgs e)
    {
        // Per-Monitor-V2 DPI awareness: the control window (operator monitor) and the
        // display window (LED panel monitor) are frequently scaled differently. Without
        // this, WPF renders at the primary monitor's DPI only, which can leave a sliver
        // of unscaled desktop visible at the edge of the fullscreen panel window.
        System.Windows.Forms.Application.SetHighDpiMode(System.Windows.Forms.HighDpiMode.PerMonitorV2);

        base.OnStartup(e);

        var config = DeviceConfigStore.Load();
        var deviceAuth = config != null ? DeviceConfigStore.DecryptDeviceAuth(config) : null;

        if (config == null || deviceAuth == null)
        {
            // Not paired (or the saved token couldn't be decrypted, e.g. moved to another
            // machine/user account) — show the pairing screen and stop here. No API base
            // URL is known yet, so there's nothing to check an update against.
            var pairing = new PairingWindow();
            pairing.Show();
            return;
        }

        // Check for an update on every startup, before showing the paired UI. If one is
        // staged, a relaunch script has already been scheduled — exit immediately so it
        // can swap the .exe (Windows won't let it touch a running file).
        if (await UpdateService.CheckAndApplyAsync(config.ApiBaseUrl))
        {
            Shutdown();
            return;
        }

        StartPairedSession(config.ApiBaseUrl, deviceAuth, config.DeviceName);
    }

    private void StartPairedSession(string apiBaseUrl, string deviceAuth, string deviceName)
    {
        var api = new ApiClient(apiBaseUrl);
        _syncService = new MediaSyncService(api, deviceAuth, TimeSpan.FromMinutes(2));

        // A DisplayWindow, once closed, can't be un-closed — the operator reopening the
        // LED panel (ControlWindow's "Reabrir tela 2") needs a fresh instance placed the
        // same way the first one was, so that placement logic is a reusable factory
        // instead of a one-shot block here.
        DisplayWindow CreateDisplay()
        {
            var win = new DisplayWindow();
            var screens = Screen.AllScreens;
            if (screens.Length >= 2)
            {
                // Primary monitor: operator control UI. Secondary: the LED panel.
                var secondary = screens.FirstOrDefault(s => !s.Primary) ?? screens[1];
                win.PlaceOnScreen(secondary);
            }
            else
            {
                // Single-monitor dev/test setup: still show both windows so the control
                // flow can be exercised, just without real fullscreen separation.
                win.Width = 640;
                win.Height = 360;
                win.WindowStyle = WindowStyle.SingleBorderWindow;
                win.Topmost = false;
            }
            return win;
        }

        var display = CreateDisplay();
        var control = new ControlWindow(display, CreateDisplay, _syncService, deviceName);

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
