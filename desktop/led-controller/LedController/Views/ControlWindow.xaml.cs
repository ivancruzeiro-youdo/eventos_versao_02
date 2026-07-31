using System.Reflection;
using System.Windows;
using System.Windows.Media.Imaging;
using LedController.Models;
using LedController.Services;
using MessageBox = System.Windows.MessageBox;

namespace LedController.Views;

/// <summary>
/// The operator-facing UI, always on the PC's primary monitor. Selecting an item here
/// only previews it locally (PreviewImage/PreviewVideo below) — nothing reaches the LED
/// panel (DisplayWindow, secondary monitor) until "Enviar para tela 2" is pressed, so the
/// operator always confirms what's about to go out before the audience sees it.
/// </summary>
public partial class ControlWindow : Window
{
    private readonly Func<DisplayWindow> _createDisplay;
    private readonly MediaSyncService _sync;
    private List<EventDto> _events = new();
    private DisplayWindow _display;
    private bool _displayClosed;
    private bool _fillMode;
    private bool _muted;
    private MediaAssetDto? _sentAsset; // whatever is currently live on the panel, if anything

    public ControlWindow(DisplayWindow display, Func<DisplayWindow> createDisplay, MediaSyncService sync, string deviceName)
    {
        InitializeComponent();
        _display = display;
        _createDisplay = createDisplay;
        _sync = sync;
        DeviceNameText.Text = deviceName;
        // Auto-generated at build time (LedController.csproj) — never hand-typed, so
        // it's always a clear, unambiguous signal of exactly which build is running.
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        AppVersionText.Text = version == null ? "" : $"v{version.Major}.{version.Minor}.{version.Build}";

        _sync.Synced += OnSynced;
        _sync.SyncFailed += OnSyncFailed;

        HookDisplayClosed();
    }

    // The operator may close the panel window (e.g. to free the LED screen between
    // shows) without closing this control window — once gone, there's nothing left to
    // drive, so the playback controls are disabled instead of throwing, and "Reabrir
    // tela 2" becomes the only way back in.
    private void HookDisplayClosed()
    {
        _display.Closed += (_, _) =>
        {
            _displayClosed = true;
            StopButton.IsEnabled = false;
            BlackButton.IsEnabled = false;
            LogoButton.IsEnabled = false;
            FillToggleButton.IsEnabled = false;
            SendToDisplayButton.IsEnabled = false;
            CloseDisplayButton.IsEnabled = false;
            ReopenDisplayButton.IsEnabled = true;
        };
    }

    private void OnSynced(SyncResponse result)
    {
        Dispatcher.Invoke(() =>
        {
            SyncStatusText.Text = $"Sincronizado às {DateTime.Now:HH:mm:ss}";
            _events = result.Events.OrderBy(ev => ev.StartAt ?? DateTime.MaxValue).ToList();

            var previouslySelected = EventSelector.SelectedItem as EventDto;
            EventSelector.ItemsSource = _events;
            EventSelector.DisplayMemberPath = nameof(EventDto.Name);

            if (previouslySelected != null)
            {
                var stillThere = _events.FirstOrDefault(e => e.Id == previouslySelected.Id);
                EventSelector.SelectedItem = stillThere ?? _events.FirstOrDefault();
            }
            else if (_events.Count > 0)
            {
                EventSelector.SelectedIndex = 0;
            }
        });
    }

    private void OnSyncFailed(Exception ex)
    {
        Dispatcher.Invoke(() => SyncStatusText.Text = $"Falha na sincronização (usando cache local): {ex.Message}");
    }

    private void EventSelector_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        var selected = EventSelector.SelectedItem as EventDto;
        MediaList.ItemsSource = selected?.MediaAssets;

        SpotifyPlaylistList.ItemsSource = selected?.SpotifyPlaylists;
        SpotifyPlaylistsEmptyText.Visibility = (selected?.SpotifyPlaylists?.Count ?? 0) == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    // Reordering only changes the in-memory list backing this session's ListBox/playback
    // order — there's no API yet to persist a custom order back to the server, so the
    // next sync will reset it to whatever order the event's mediaAssets came back in.
    private void MoveUp_Click(object sender, RoutedEventArgs e) => MoveAsset(sender, -1);
    private void MoveDown_Click(object sender, RoutedEventArgs e) => MoveAsset(sender, 1);

    private void MoveAsset(object sender, int delta)
    {
        if (sender is not FrameworkElement { Tag: MediaAssetDto asset }) return;
        if (EventSelector.SelectedItem is not EventDto selected) return;

        var list = selected.MediaAssets;
        var idx = list.IndexOf(asset);
        var newIdx = idx + delta;
        if (idx < 0 || newIdx < 0 || newIdx >= list.Count) return;

        (list[idx], list[newIdx]) = (list[newIdx], list[idx]);

        // ListBox doesn't observe in-place List<T> mutations — force it to re-read.
        MediaList.ItemsSource = null;
        MediaList.ItemsSource = list;
        MediaList.SelectedItem = asset;
    }

    private void MediaList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (MediaList.SelectedItem is not MediaAssetDto asset)
        {
            ShowPreviewIdle();
            SendToDisplayButton.IsEnabled = false;
            return;
        }

        if (!_sync.IsCached(asset))
        {
            MessageBox.Show(this,
                $"\"{asset.Name}\" ainda não foi baixado para este PC. Aguarde a próxima sincronização.",
                "Mídia não disponível offline", MessageBoxButton.OK, MessageBoxImage.Warning);
            ShowPreviewIdle();
            SendToDisplayButton.IsEnabled = false;
            return;
        }

        ShowPreviewAsset(asset);
        SendToDisplayButton.IsEnabled = !_displayClosed;
    }

    private void ShowPreviewIdle()
    {
        PreviewVideo.Stop();
        PreviewVideo.Visibility = Visibility.Collapsed;
        PreviewImage.Visibility = Visibility.Collapsed;
        PreviewIdleText.Visibility = Visibility.Visible;
    }

    private void ShowPreviewAsset(MediaAssetDto asset)
    {
        PreviewIdleText.Visibility = Visibility.Collapsed;
        var path = _sync.GetCachedPath(asset);

        if (asset.MediaType == "image")
        {
            PreviewVideo.Stop();
            PreviewVideo.Visibility = Visibility.Collapsed;
            PreviewImage.Source = new BitmapImage(new Uri(path, UriKind.Absolute));
            PreviewImage.Visibility = Visibility.Visible;
        }
        else
        {
            // Video and audio-only assets both use the preview MediaElement, always muted —
            // this preview is just to confirm the right file/frame, not to hear it locally.
            PreviewImage.Visibility = Visibility.Collapsed;
            PreviewVideo.IsMuted = true;
            PreviewVideo.Source = new Uri(path, UriKind.Absolute);
            PreviewVideo.Visibility = Visibility.Visible;
            PreviewVideo.Play();
        }
    }

    private void SendToDisplayButton_Click(object sender, RoutedEventArgs e)
    {
        if (_displayClosed) return;
        if (MediaList.SelectedItem is not MediaAssetDto asset) return;

        _display.ShowAsset(asset, _sync.GetCachedPath(asset));
        _sentAsset = asset;
        UpdateAudioStatus();
    }

    private void MuteButton_Click(object sender, RoutedEventArgs e)
    {
        _muted = !_muted;
        MuteButton.Content = _muted ? "🔇 Desmutar" : "🔊 Mutar";
        if (!_displayClosed) _display.IsMuted = _muted;
        UpdateAudioStatus();
    }

    private void UpdateAudioStatus()
    {
        if (_sentAsset == null)
        {
            AudioStatusText.Text = "— Nada em exibição no painel";
        }
        else if (_sentAsset.MediaType == "image")
        {
            AudioStatusText.Text = "— Sem áudio (imagem em exibição)";
        }
        else
        {
            AudioStatusText.Text = _muted ? "🔇 Mudo — painel sem som" : "🔊 Áudio tocando no painel";
        }
    }

    private void StopButton_Click(object sender, RoutedEventArgs e)
    {
        if (_displayClosed) return;
        _display.ShowIdle();
        _sentAsset = null;
        UpdateAudioStatus();
    }

    private void BlackButton_Click(object sender, RoutedEventArgs e)
    {
        if (_displayClosed) return;
        _display.ShowBlack();
        _sentAsset = null;
        UpdateAudioStatus();
    }

    private void LogoButton_Click(object sender, RoutedEventArgs e)
    {
        if (_displayClosed) return;
        _display.ShowLogo();
        _sentAsset = null;
        UpdateAudioStatus();
    }

    private void FillToggleButton_Click(object sender, RoutedEventArgs e)
    {
        _fillMode = !_fillMode;
        FillToggleButton.Content = _fillMode ? "Preenchendo tela (zoom) ✓" : "Preencher tela (zoom)";
        if (!_displayClosed) _display.SetFillMode(_fillMode);
    }

    private async void SyncNowButton_Click(object sender, RoutedEventArgs e)
    {
        SyncStatusText.Text = "Sincronizando...";
        await _sync.SafeSyncOnce();
    }

    private void CloseDisplayButton_Click(object sender, RoutedEventArgs e)
    {
        _display.Close();
    }

    private void ReopenDisplayButton_Click(object sender, RoutedEventArgs e)
    {
        _display = _createDisplay();
        HookDisplayClosed();
        _display.SetFillMode(_fillMode);
        _display.IsMuted = _muted;
        _display.Show();
        _display.ShowIdle();
        _sentAsset = null;
        UpdateAudioStatus();

        _displayClosed = false;
        StopButton.IsEnabled = true;
        BlackButton.IsEnabled = true;
        LogoButton.IsEnabled = true;
        FillToggleButton.IsEnabled = true;
        SendToDisplayButton.IsEnabled = MediaList.SelectedItem is MediaAssetDto;
        CloseDisplayButton.IsEnabled = true;
        ReopenDisplayButton.IsEnabled = false;
    }
}
