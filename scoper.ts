// index.ts
import { serve } from "bun";

const PORT = 3005;

serve({
    port: PORT,
    fetch(req: Request) {
        // Log the request URL
        console.log("URL:", req.url);

        // Log the request method (e.g., GET, POST)
        console.log("Method:", req.method);

        // Log the request headers
        console.log("Cookies:", req.headers.get("cookie"));
        return new Response("Hello World from Bun with TypeScript! Bruh!");
    },
});
