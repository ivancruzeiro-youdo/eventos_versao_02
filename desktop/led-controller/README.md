# YouDO LED Controller

App Windows (.NET 8 / WPF) instalado em cada espaço físico, controlando o painel de LED
como monitor secundário do PC. Parte do subsistema de gestão de áudio/vídeo/imagem
descrito no plano da sessão que criou este projeto.

## ⚠️ Importante — este código não foi compilado nem testado

Este projeto foi escrito num Mac (sem SDK do .NET, sem Windows) — é só o esqueleto da
Fase 1. **Precisa ser aberto e compilado numa máquina Windows** com:

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 (workload ".NET desktop development") **ou** `dotnet build` direto
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) — só será
  necessário quando a Fase 3 (Spotify) for implementada; o pacote NuGet já está referenciado.

```powershell
cd desktop/led-controller
dotnet restore
dotnet build
dotnet run --project LedController
```

## O que já funciona (Fase 1)

- **Pareamento**: tela inicial pede a URL da API + o código de 6 dígitos gerado em
  `/venues/:id` (seção "Dispositivos de Mídia") → chama `POST /api/v2/devices/pair` →
  salva o token de longa duração criptografado (DPAPI) em
  `%LOCALAPPDATA%\YouDoLedController\config.json`.
- **Sincronização em background** (`Services/MediaSyncService.cs`): chama
  `GET /api/v2/devices/sync` a cada 2 minutos, mantém um manifesto local
  (`manifest.json`) do que já foi baixado, e envia `POST /api/v2/devices/heartbeat`.
- **Duas janelas** (`Views/ControlWindow` no monitor principal, `Views/DisplayWindow`
  no monitor secundário/painel de LED): o operador escolhe o evento e a mídia na tela
  de controle, e ela aparece em fullscreen no painel — mesmo modelo de um "telão"
  convencional / apresentador de slides.

## O que ainda falta (Fases 2 e 3 — não implementadas aqui)

- **Fase 2**: a API ainda não tem endpoint de upload de mídia por evento nem
  `GET /devices/media/:assetId/download` — por isso `MediaSyncService.ReconcileAsync`
  hoje só atualiza o manifesto local, sem baixar nada de verdade (tem um `TODO`
  marcado no código exatamente onde plugar isso).
- **Fase 3**: integração com Spotify (Web Playback SDK via `WebView2`, token de
  reprodução vindo do backend). O pacote `Microsoft.Web.WebView2` já está no
  `.csproj`, mas nenhuma tela/serviço de Spotify existe ainda.

## Estrutura

```
LedController/
  App.xaml(.cs)              — decide pareamento vs. sessão pareada; posiciona
                                DisplayWindow no monitor secundário via
                                System.Windows.Forms.Screen
  Models/SyncModels.cs        — DTOs que espelham o JSON de devices.ts
  Services/ApiClient.cs        — cliente HTTP (pair, sync, heartbeat, download)
  Services/DeviceConfigStore.cs — persistência local (config + cache de mídia)
  Services/MediaSyncService.cs  — timer de sync + manifesto local
  Views/PairingWindow           — tela de pareamento (1ª execução)
  Views/ControlWindow           — UI do operador (monitor principal)
  Views/DisplayWindow           — o painel de LED em si (monitor secundário, fullscreen)
```
