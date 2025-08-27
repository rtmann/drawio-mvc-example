using drawiomvc.Models;

namespace drawiomvc.Services;

public sealed class DiagramStorageService : IDiagramStorage
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<DiagramStorageService> _logger;
    private static readonly SemaphoreSlim SaveLock = new(1,1);
    private const string Folder = "testDiagrams"; // under wwwroot

    public DiagramStorageService(IWebHostEnvironment env, ILogger<DiagramStorageService> logger)
    {
        _env = env;
        _logger = logger;
    }

    private string RootDir => Path.Combine(_env.WebRootPath, Folder);

    public IEnumerable<DiagramInfo> ListDiagrams()
    {
        var dir = RootDir;
        if (!Directory.Exists(dir)) yield break;
        foreach (var file in Directory.EnumerateFiles(dir, "*.drawio", SearchOption.TopDirectoryOnly))
        {
            var fileName = Path.GetFileName(file);
            var title = ToTitle(Path.GetFileNameWithoutExtension(file));
            yield return new DiagramInfo(fileName, title, $"/{Folder}/{fileName}");
        }
    }

    public async Task<(bool ok, string? message, DiagramInfo? info)> CreateAsync(string rawName, CancellationToken ct = default)
    {
        var name = SanitizeFileName(rawName);
        if (string.IsNullOrWhiteSpace(name)) return (false, "Invalid name", null);
        Directory.CreateDirectory(RootDir);
        var fileName = name + ".drawio";
        var path = Path.Combine(RootDir, fileName);
        if (File.Exists(path)) return (false, "Diagram already exists", null);
        try
        {
            var blankXml = $"<mxfile host=\"app.diagrams.net\" modified=\"{DateTime.UtcNow:O}\" agent=\"drawiomvc\" version=\"24.7.0\" type=\"device\"><diagram id=\"{Guid.NewGuid():N}\" name=\"Page-1\"><mxGraphModel dx=\"1000\" dy=\"600\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"850\" pageHeight=\"1100\" math=\"0\" shadow=\"0\"><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>";
            await File.WriteAllTextAsync(path, blankXml, ct);
            var info = new DiagramInfo(fileName, ToTitle(name), $"/{Folder}/{fileName}");
            return (true, null, info);
        }
        catch (UnauthorizedAccessException ua)
        {
            _logger.LogError(ua, "Permission denied creating diagram {File}", fileName);
            return (false, "Permission denied (container write issue)", null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error creating diagram {File}", fileName);
            return (false, "Create failed", null);
        }
    }

    public async Task<(bool ok, string? message)> SaveAsync(string fileName, string xml, CancellationToken ct = default)
    {
        if (!xml.Contains("<mxfile") || !xml.Contains("<diagram")) return (false, "Invalid diagram xml");
        var sanitized = EnsureSanitizedFileName(fileName);
        if (sanitized is null) return (false, "Invalid file name");
        Directory.CreateDirectory(RootDir);
        var path = Path.Combine(RootDir, sanitized);
        try
        {
            await SaveLock.WaitAsync(ct);
            await File.WriteAllTextAsync(path, xml, ct);
            _logger.LogInformation("Saved diagram {File}", sanitized);
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Save failed for {File}", sanitized);
            return (false, "Save failed");
        }
        finally
        {
            if (SaveLock.CurrentCount == 0) SaveLock.Release();
        }
    }

    public bool Exists(string fileName) => File.Exists(Path.Combine(RootDir, fileName));
    public string? GetPhysicalPath(string fileName)
    {
        var sanitized = EnsureSanitizedFileName(fileName);
        if (sanitized is null) return null;
        var path = Path.Combine(RootDir, sanitized);
        return File.Exists(path) ? path : null;
    }

    private static string? EnsureSanitizedFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return null;
        var name = fileName.EndsWith(".drawio", StringComparison.OrdinalIgnoreCase)
            ? fileName[..^7] : fileName;
        var sanitized = SanitizeFileName(name);
        return string.IsNullOrWhiteSpace(sanitized) ? null : sanitized + ".drawio";
    }

    private static string SanitizeFileName(string name)
    {
        var cleaned = new string(name.Trim()
            .Select(ch => char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' || ch == ' ' ? ch : '-')
            .ToArray());
        while (cleaned.Contains("  ")) cleaned = cleaned.Replace("  ", " ");
        cleaned = cleaned.Replace(' ', '-');
        cleaned = cleaned.Trim('-', '_');
        if (cleaned.Length > 64) cleaned = cleaned[..64];
        return cleaned.ToLowerInvariant();
    }

    private static string ToTitle(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return raw;
        return string.Join(' ', raw
            .Replace('-', ' ')
            .Replace('_', ' ')
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => char.ToUpperInvariant(w[0]) + w[1..]));
    }
}
