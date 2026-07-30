using System.Windows;
using LedController.Models;
using LedController.Services;

namespace LedController.Views;

/// <summary>
/// The operator-facing UI, always on the PC's primary monitor. Picking an item here
/// is what shows up fullscreen on DisplayWindow (the LED panel, secondary monitor) —
/// same interaction model as a conventional "telão"/presenter-view slide clicker.
/// </summary>
public partial class ControlWindow : Window
{
    private readonly DisplayWindow _display;
    private readonly MediaSyncService _sync;
    private List<EventDto> _events = new();

    public ControlWindow(DisplayWindow display, MediaSyncService sync, string deviceName)
    {
        InitializeComponent();
        _display = display;
        _sync = sync;
        DeviceNameText.Text = deviceName;

        _sync.Synced += OnSynced;
        _sync.SyncFailed += OnSyncFailed;
    }

    private void OnSynced(SyncResponse result)
    {
        Dispatcher.Invoke(() =>
        {
            SyncStatusText.Text = $"Sincronizado às {DateTime.Now:HH:mm:ss}";
            _events = result.Events;

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
    }

    private void MediaList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (MediaList.SelectedItem is not MediaAssetDto asset) return;

        if (!_sync.IsCached(asset.Id))
        {
            MessageBox.Show(this,
                $"\"{asset.Name}\" ainda não foi baixado para este PC. Aguarde a próxima sincronização.",
                "Mídia não disponível offline", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        _display.ShowAsset(asset, _sync.GetCachedPath(asset.Id));
    }

    private void StopButton_Click(object sender, RoutedEventArgs e)
    {
        MediaList.SelectedItem = null;
        _display.ShowIdle();
    }

    private async void SyncNowButton_Click(object sender, RoutedEventArgs e)
    {
        SyncStatusText.Text = "Sincronizando...";
        await _sync.SafeSyncOnce();
    }
}
