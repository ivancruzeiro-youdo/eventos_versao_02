using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LedController.Models;
using Point = System.Windows.Point;
using Size = System.Windows.Size;

namespace LedController.Views;

/// <summary>
/// The LED panel itself, driven as a secondary Windows monitor. Always fullscreen,
/// borderless, topmost — behaves like a conventional "telão" display: whatever is
/// selected on ControlWindow (the operator's primary-monitor UI) shows up here.
/// Positioning onto the actual secondary screen happens in App.xaml.cs (PlaceOnScreen).
/// </summary>
public partial class DisplayWindow : Window
{
    private System.Windows.Forms.Screen? _targetScreen;
    private bool _fillMode;
    private Size? _videoNaturalSize;

    public DisplayWindow()
    {
        InitializeComponent();
        VideoDisplay.MediaOpened += (_, _) =>
        {
            _videoNaturalSize = new Size(VideoDisplay.NaturalVideoWidth, VideoDisplay.NaturalVideoHeight);
            ApplyZoom(VideoDisplay, _videoNaturalSize);
        };
    }

    public void PlaceOnScreen(System.Windows.Forms.Screen screen)
    {
        _targetScreen = screen;
        WindowState = WindowState.Normal;
        WindowStartupLocation = WindowStartupLocation.Manual;

        // Rough placement in WPF's DPI-scaled units, just so the window doesn't flash on
        // the wrong monitor before the native handle exists below.
        var bounds = screen.Bounds;
        Left = bounds.Left;
        Top = bounds.Top;
        Width = bounds.Width;
        Height = bounds.Height;

        // Authoritative placement: WPF's Left/Top/Width/Height are DPI-scaled logical
        // units, which only match the monitor's real pixel bounds when every monitor
        // shares the same scale factor. Operator and LED-panel monitors frequently don't
        // (e.g. 100% vs 125%), so the window ends up short of the edge on one side.
        // SetWindowPos operates in actual physical pixels regardless of DPI, so it's used
        // once the window has a real Win32 handle to guarantee an exact edge-to-edge fit.
        SourceInitialized += (_, _) => ApplyNativeBounds();
    }

    private void ApplyNativeBounds()
    {
        if (_targetScreen == null) return;
        var hwnd = new WindowInteropHelper(this).Handle;
        var b = _targetScreen.Bounds;
        NativeMethods.SetWindowPos(hwnd, IntPtr.Zero, b.Left, b.Top, b.Width, b.Height,
            NativeMethods.SWP_NOZORDER | NativeMethods.SWP_NOACTIVATE);
    }

    /// <summary>
    /// Toggles between letterboxed (whole frame visible, may leave bars if the asset's
    /// aspect ratio doesn't match the panel) and edge-to-edge (crops the overflow so the
    /// panel has zero empty area) rendering.
    ///
    /// Deliberately NOT implemented via MediaElement's own Stretch=UniformToFill: that
    /// mode has a long-documented WPF bug where its internal crop isn't reliably centered
    /// for video (the visible content ends up nudged toward one edge instead of centered).
    /// Stretch=Uniform, by contrast, is always centered correctly. So both elements stay
    /// on Uniform permanently, and "fill" is instead simulated with a manual, centered
    /// ScaleTransform computed from the asset's natural size vs the panel's — same visual
    /// result (edge-to-edge crop), without going through the buggy code path.
    /// </summary>
    public void SetFillMode(bool fill)
    {
        _fillMode = fill;
        ApplyZoom(ImageDisplay, GetPixelSize(ImageDisplay.Source));
        ApplyZoom(VideoDisplay, _videoNaturalSize);
    }

    private static Size? GetPixelSize(ImageSource? source) =>
        source is BitmapSource bmp ? new Size(bmp.PixelWidth, bmp.PixelHeight) : null;

    private void ApplyZoom(FrameworkElement element, Size? naturalSize)
    {
        if (!_fillMode || naturalSize is not { Width: > 0, Height: > 0 } natural ||
            ActualWidth <= 0 || ActualHeight <= 0)
        {
            element.RenderTransform = Transform.Identity;
            return;
        }

        // Uniform already scaled the content by min(cw/nw, ch/nh) and centered it — the
        // extra zoom needed to reach a full "cover" crop is just the ratio between that
        // and the max(...) a UniformToFill would have used, applied around the element's
        // own center so the already-centered Uniform result stays centered.
        var cw = ActualWidth;
        var ch = ActualHeight;
        var uniformScale = Math.Min(cw / natural.Width, ch / natural.Height);
        var fillScale = Math.Max(cw / natural.Width, ch / natural.Height);
        var extraZoom = fillScale / uniformScale;

        element.RenderTransformOrigin = new Point(0.5, 0.5);
        element.RenderTransform = new ScaleTransform(extraZoom, extraZoom);
    }

    /// <summary>Muted state of whatever is currently playing on the panel (video or audio asset).</summary>
    public bool IsMuted
    {
        get => VideoDisplay.IsMuted;
        set => VideoDisplay.IsMuted = value;
    }

    public void ShowIdle()
    {
        VideoDisplay.Stop();
        VideoDisplay.Visibility = Visibility.Collapsed;
        ImageDisplay.Visibility = Visibility.Collapsed;
        LogoDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Visible;
    }

    /// <summary>Manual override: panel goes fully black (window background), no logo/text.</summary>
    public void ShowBlack()
    {
        VideoDisplay.Stop();
        VideoDisplay.Visibility = Visibility.Collapsed;
        ImageDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Collapsed;
        LogoDisplay.Visibility = Visibility.Collapsed;
    }

    /// <summary>Manual override: shows the YouDO wordmark, e.g. between segments of a show.</summary>
    public void ShowLogo()
    {
        VideoDisplay.Stop();
        VideoDisplay.Visibility = Visibility.Collapsed;
        ImageDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Collapsed;
        LogoDisplay.Visibility = Visibility.Visible;
    }

    public void ShowImage(string localFilePath)
    {
        VideoDisplay.Stop();
        VideoDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Collapsed;
        LogoDisplay.Visibility = Visibility.Collapsed;

        var bitmap = new BitmapImage(new Uri(localFilePath, UriKind.Absolute));
        ImageDisplay.Source = bitmap;
        ImageDisplay.Visibility = Visibility.Visible;
        ApplyZoom(ImageDisplay, new Size(bitmap.PixelWidth, bitmap.PixelHeight));
    }

    public void PlayVideo(string localFilePath)
    {
        ImageDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Collapsed;
        LogoDisplay.Visibility = Visibility.Collapsed;

        _videoNaturalSize = null;
        VideoDisplay.RenderTransform = Transform.Identity;
        VideoDisplay.Source = new Uri(localFilePath, UriKind.Absolute);
        VideoDisplay.Visibility = Visibility.Visible;
        VideoDisplay.Play();
    }

    public void ShowAsset(MediaAssetDto asset, string localFilePath)
    {
        switch (asset.MediaType)
        {
            case "image":
                ShowImage(localFilePath);
                break;
            case "video":
                PlayVideo(localFilePath);
                break;
            case "audio":
                // Audio-only content has nothing to show on the panel itself — keep the
                // idle slate and just play sound via VideoDisplay (MediaElement handles
                // audio-only files fine, it simply renders no video frame).
                ShowIdle();
                VideoDisplay.Source = new Uri(localFilePath, UriKind.Absolute);
                VideoDisplay.Play();
                break;
        }
    }
}
