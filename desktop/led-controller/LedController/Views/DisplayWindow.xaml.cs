using System.Windows;
using System.Windows.Media.Imaging;
using LedController.Models;

namespace LedController.Views;

/// <summary>
/// The LED panel itself, driven as a secondary Windows monitor. Always fullscreen,
/// borderless, topmost — behaves like a conventional "telão" display: whatever is
/// selected on ControlWindow (the operator's primary-monitor UI) shows up here.
/// Positioning onto the actual secondary screen happens in App.xaml.cs (PlaceOnScreen).
/// </summary>
public partial class DisplayWindow : Window
{
    public DisplayWindow()
    {
        InitializeComponent();
    }

    public void PlaceOnScreen(System.Windows.Forms.Screen screen)
    {
        var bounds = screen.Bounds;
        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = bounds.Left;
        Top = bounds.Top;
        Width = bounds.Width;
        Height = bounds.Height;
        WindowState = WindowState.Maximized;
    }

    public void ShowIdle()
    {
        VideoDisplay.Stop();
        VideoDisplay.Visibility = Visibility.Collapsed;
        ImageDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Visible;
    }

    public void ShowImage(string localFilePath)
    {
        VideoDisplay.Stop();
        VideoDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Collapsed;

        ImageDisplay.Source = new BitmapImage(new Uri(localFilePath, UriKind.Absolute));
        ImageDisplay.Visibility = Visibility.Visible;
    }

    public void PlayVideo(string localFilePath)
    {
        ImageDisplay.Visibility = Visibility.Collapsed;
        IdleText.Visibility = Visibility.Collapsed;

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
