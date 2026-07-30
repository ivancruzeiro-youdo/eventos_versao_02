using System.Windows;
using LedController.Services;

namespace LedController.Views;

public partial class PairingWindow : Window
{
    public PairingWindow()
    {
        InitializeComponent();
    }

    private async void PairButton_Click(object sender, RoutedEventArgs e)
    {
        var apiUrl = ApiUrlBox.Text.Trim();
        var code = PairingCodeBox.Text.Trim();

        if (string.IsNullOrEmpty(apiUrl) || string.IsNullOrEmpty(code))
        {
            StatusText.Text = "Preencha a URL da API e o código.";
            return;
        }

        PairButton.IsEnabled = false;
        StatusText.Foreground = System.Windows.Media.Brushes.Crimson;
        StatusText.Text = "Pareando...";

        try
        {
            var api = new ApiClient(apiUrl);
            var result = await api.PairAsync(code);
            DeviceConfigStore.Save(apiUrl, result.VenueId, result.DeviceName, result.DeviceAuth);

            StatusText.Foreground = System.Windows.Media.Brushes.Green;
            StatusText.Text = $"Pareado com sucesso como \"{result.DeviceName}\". Reiniciando...";

            // Restart into the paired flow (App.xaml.cs decides Pairing vs Control+Display based on saved config).
            System.Diagnostics.Process.Start(System.Environment.ProcessPath!);
            System.Windows.Application.Current.Shutdown();
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Falha ao parear: {ex.Message}";
        }
        finally
        {
            PairButton.IsEnabled = true;
        }
    }
}
