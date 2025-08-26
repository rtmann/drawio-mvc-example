using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using drawiomvc.Models;

namespace drawiomvc.Controllers;

public class DrawIoController : Controller
{
    private readonly Services.IDiagramStorage _storage;
    private readonly ILogger<DrawIoController> _logger;

    public DrawIoController(Services.IDiagramStorage storage, ILogger<DrawIoController> logger)
    {
        _storage = storage;
        _logger = logger;
    }

    // GET /DrawIo
    public IActionResult Index()
    {
        return RedirectToAction(nameof(Embedded));
    }

    // GET /DrawIo/Embedded
    public IActionResult Embedded()
        => View("DrawIOEmbeded", _storage.ListDiagrams().ToList());

    public record CreateDiagramRequest(string Name);
    public record SaveDiagramRequest(string FileName, string Xml);

    [HttpPost]
    [Route("DrawIo/Create")]
    public async Task<IActionResult> Create([FromBody] CreateDiagramRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { success = false, message = "Name required" });
        var (ok, message, info) = await _storage.CreateAsync(request.Name);
        if (!ok || info is null)
            return Conflict(new { success = false, message });
        return Ok(new { success = true, fileName = info.FileName, title = info.Title, url = info.Url });
    }

    [HttpPost]
    [Route("DrawIo/Save")]
    public async Task<IActionResult> Save([FromBody] SaveDiagramRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.FileName) || string.IsNullOrWhiteSpace(request.Xml))
            return BadRequest(new { success = false, message = "FileName and Xml required" });
    var (ok, message) = await _storage.SaveAsync(request.FileName, request.Xml);
    if (!ok) return BadRequest(new { success = false, message });
    return Ok(new { success = true, fileName = request.FileName });
    }
}
