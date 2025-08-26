using drawiomvc.Models;

namespace drawiomvc.Services;

public interface IDiagramStorage
{
    IEnumerable<DiagramInfo> ListDiagrams();
    Task<(bool ok, string? message, DiagramInfo? info)> CreateAsync(string rawName, CancellationToken ct = default);
    Task<(bool ok, string? message)> SaveAsync(string fileName, string xml, CancellationToken ct = default);
    bool Exists(string fileName);
    string? GetPhysicalPath(string fileName);
}
