namespace LedController.Models;

// Mirrors the JSON shapes returned by apps/api/src/routes/devices.ts.
// Field names match the API's camelCase JSON exactly (see JsonSerializerOptions
// in ApiClient, which uses CamelCase naming policy).

public class PairResponse
{
    public bool Success { get; set; }
    public string DeviceAuth { get; set; } = "";
    public string VenueId { get; set; } = "";
    public string DeviceName { get; set; } = "";
}

public class SyncResponse
{
    public bool Success { get; set; }
    public string VenueId { get; set; } = "";
    public List<EventDto> Events { get; set; } = new();
}

public class EventDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string ClientName { get; set; } = "";
    public DateTime? StartAt { get; set; }
    public DateTime? TeardownAt { get; set; }
    public string Status { get; set; } = "";
    public List<MediaAssetDto> MediaAssets { get; set; } = new();
    public List<SpotifyPlaylistDto> SpotifyPlaylists { get; set; } = new();
}

// One of possibly several playlists curated for this event (see EventSpotifyPlaylist.tsx
// on the web side) — Comment is operator-facing context (e.g. "tocar no jantar"), shown
// alongside the name in ControlWindow so whoever's running the show picks the right one.
public class SpotifyPlaylistDto
{
    public string Id { get; set; } = "";
    public string SpotifyPlaylistId { get; set; } = "";
    public string SpotifyPlaylistName { get; set; } = "";
    public string? Comment { get; set; }

    public string DisplayComment => string.IsNullOrWhiteSpace(Comment) ? "Sem comentário" : Comment;
}

public class MediaAssetDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string MediaType { get; set; } = ""; // video | image | audio
    public string MimeType { get; set; } = "";
    public long SizeBytes { get; set; }
    public double? DurationSec { get; set; }
    public string Checksum { get; set; } = "";
    public int Order { get; set; }
}

public class ApiErrorResponse
{
    public string? Error { get; set; }
}

public class DownloadUrlResponse
{
    public bool Success { get; set; }
    public string DownloadUrl { get; set; } = "";
    public string Checksum { get; set; } = "";
}

public class LatestVersionResponse
{
    public bool Success { get; set; }
    public string? Version { get; set; } // null when no release has been published yet
    public string? DownloadUrl { get; set; }
    public string? ReleaseNotes { get; set; }
    public DateTime? PublishedAt { get; set; }
}
