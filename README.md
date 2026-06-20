# Angular File Drop

An Angular-first directive that brings the core drag-and-drop functionality of Dropzone.js natively into the Angular ecosystem—without the bloat.

### The Philosophy
Dropzone.js is great, but it often fights against modern Angular architecture by injecting its own CSS, mutating the DOM, and hijacking HTTP requests with its own XHR wrappers. 

`angular-file-drop` is designed to be the "Angular-only" alternative. It does a portion of what Dropzone does, but does it strictly the Angular way:

*   **Native Directives:** It binds seamlessly to your existing elements using standard Angular syntax.
*   **Headless Design:** It handles the complex HTML5 drag-and-drop events and simply hands you the raw `File` objects.
*   **Zero Network Opinions:** You handle the uploads using Angular's native `HttpClient`, keeping your interceptors and auth tokens intact.
*   **Bring Your Own UI:** No forced stylesheets. Build and style your dropzone exactly how your app needs it.

If you want the drag-and-drop ease of Dropzone but insist on keeping your codebase purely Angular, this directive is for you.