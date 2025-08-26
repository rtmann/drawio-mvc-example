var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.AddSingleton<drawiomvc.Services.IDiagramStorage, drawiomvc.Services.DiagramStorageService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

// Serve static files (including runtime-created .drawio) BEFORE routing/endpoints
var contentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".drawio"] = "application/xml";
contentTypeProvider.Mappings[".md"] = "text/markdown"; // allow README.md to be served
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypeProvider });

// Serve repository-level docs (screenshot for README) from ../docs at /docs
var docsPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "docs"));
if (Directory.Exists(docsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(docsPath),
        RequestPath = "/docs"
    });
}

app.UseRouting();

// (Optional) temporary 404 logging - can remove later
app.Use(async (ctx, next) =>
{
    await next();
    if (ctx.Response.StatusCode == 404 && ctx.Request.Path.HasValue && ctx.Request.Path.Value.EndsWith(".drawio", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine($"[404 after pipeline] {ctx.Request.Path}");
    }
});

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=DrawIo}/{action=Index}/{id?}");

// Serve root README.md (content root) - use single mapping; fetch will try /README.md first
app.MapGet("/README.md", (IWebHostEnvironment env) =>
{
    var primary = Path.Combine(env.ContentRootPath, "README.md");
    // Also check one directory up (solution root) where the repo-level README lives
    var parent = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "README.md"));
    var path = System.IO.File.Exists(primary) ? primary : parent;
    if (System.IO.File.Exists(path))
    {
        return Results.File(path, "text/markdown");
    }
    Console.WriteLine($"[README] Not found. Checked: {primary} and {parent}");
    return Results.NotFound();
});

// Serve LICENSE (plain text)
app.MapGet("/LICENSE", (IWebHostEnvironment env) =>
{
    var primary = Path.Combine(env.ContentRootPath, "LICENSE");
    var parent = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "LICENSE"));
    var path = System.IO.File.Exists(primary) ? primary : parent;
    if (System.IO.File.Exists(path))
    {
        return Results.File(path, "text/plain");
    }
    Console.WriteLine($"[LICENSE] Not found. Checked: {primary} and {parent}");
    return Results.NotFound();
});
app.MapGet("/LICENSE.txt", (IWebHostEnvironment env) =>
{
    var primary = Path.Combine(env.ContentRootPath, "LICENSE.txt");
    var fallback = Path.Combine(env.ContentRootPath, "LICENSE");
    var parentTxt = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "LICENSE.txt"));
    var parent = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "LICENSE"));
    string path = null!;
    foreach (var p in new[] { primary, fallback, parentTxt, parent })
    {
        if (System.IO.File.Exists(p)) { path = p; break; }
    }
    if (!string.IsNullOrEmpty(path)) return Results.File(path, "text/plain");
    Console.WriteLine($"[LICENSE] Not found. Checked variants: {primary}; {fallback}; {parentTxt}; {parent}");
    return Results.NotFound();
});


app.Run();
