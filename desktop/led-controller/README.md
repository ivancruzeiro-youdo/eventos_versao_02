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
  `GET /api/v2/devices/sync` a cada 2 minutos, baixa (via presigned S3 URL,
  `GET /api/v2/devices/media/:assetId/download`) qualquer mídia nova ou alterada
  (comparando checksum), mantém um manifesto local (`manifest.json`) do que já foi
  baixado, remove do cache o que não é mais referenciado por nenhum evento futuro, e
  envia `POST /api/v2/devices/heartbeat`.
- **Duas janelas** (`Views/ControlWindow` no monitor principal, `Views/DisplayWindow`
  no monitor secundário/painel de LED): o operador escolhe o evento e a mídia na tela
  de controle, e ela aparece em fullscreen no painel — mesmo modelo de um "telão"
  convencional / apresentador de slides.
- **Upload/gestão de mídia por evento (Fase 2, lado servidor)**: aba "Mídia" na página
  do evento (`apps/web/src/components/EventMediaTab.tsx`) — upload direto pro S3
  (presign/confirm), renomear, reordenar, excluir. É o que popula a `EventMediaAsset`
  que o `/devices/sync` devolve.

- **Autoatualização** (`Services/UpdateService.cs`): a cada início (depois de pareado),
  chama `GET /api/v2/devices/latest-version` (endpoint público, sem auth — o app pode
  checar mesmo antes de ter sessão pareada) e compara com a versão do próprio `.exe`
  (`<Version>` do `.csproj`, embutida no assembly). Se houver versão mais nova, baixa o
  novo `.exe`, agenda um script `.bat` que espera o processo atual encerrar, substitui o
  arquivo e reabre, e então encerra o processo atual. **Só funciona no `.exe` publicado
  como single-file** (ver seção "Publicar uma nova versão" abaixo) — em `dotnet run`
  o processo "atual" é o `dotnet.exe`, então a checagem é pulada de propósito.
- **Publicar/baixar versões** (lado servidor + web): página "Sistemas → Downloads"
  (`apps/web/src/app/downloads/page.tsx`) — administradores publicam um novo `.exe`
  (upload direto pro S3 via presign/confirm, mesmo padrão de mídia) com um número de
  versão; qualquer usuário logado pode baixar a versão atual dali. O app Windows nunca
  precisa dessa tela — ele só consulta `/devices/latest-version` diretamente.

## O que ainda falta (Fase 3 — não implementada aqui)

- Integração com Spotify (Web Playback SDK via `WebView2`, token de reprodução vindo
  do backend). O pacote `Microsoft.Web.WebView2` já está no `.csproj`, mas nenhuma
  tela/serviço de Spotify existe ainda — nem do lado do app, nem da API.

## Publicar uma nova versão

A autoatualização só funciona com um `.exe` único e autocontido (sem depender de um
runtime .NET instalado na máquina do espaço, e sem uma pasta de DLLs ao lado que o
script de substituição não sabe atualizar). O `.csproj` já está configurado para isso
(`PublishSingleFile`, `SelfContained`, `RuntimeIdentifier=win-x64`). Para publicar:

```powershell
cd desktop/led-controller
# 1. Bumpar a versão no LedController.csproj (<Version>, <AssemblyVersion>, <FileVersion>)
dotnet publish LedController -c Release
# gera: LedController/bin/Release/net8.0-windows/win-x64/publish/YouDoLedController.exe
```

Depois, subir esse `.exe` em **Sistemas → Downloads** (como admin) informando o mesmo
número de versão do `<Version>` — é essa comparação que decide se um espaço já
atualizado precisa baixar de novo.

## Estrutura

```
LedController/
  App.xaml(.cs)              — decide pareamento vs. sessão pareada; checa
                                atualização; posiciona DisplayWindow no monitor
                                secundário via System.Windows.Forms.Screen
  Models/SyncModels.cs        — DTOs que espelham o JSON de devices.ts
  Services/ApiClient.cs        — cliente HTTP (pair, sync, heartbeat, download, latest-version)
  Services/DeviceConfigStore.cs — persistência local (config + cache de mídia)
  Services/MediaSyncService.cs  — timer de sync + manifesto local
  Services/UpdateService.cs     — checagem de versão + autossubstituição do .exe
  Views/PairingWindow           — tela de pareamento (1ª execução)
  Views/ControlWindow           — UI do operador (monitor principal)
  Views/DisplayWindow           — o painel de LED em si (monitor secundário, fullscreen)
```
