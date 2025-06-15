<script lang="ts">
  import "../app.css";
  import Nav from "$lib/components/Nav.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <title>transparency.cafe</title>
  <meta
    name="description"
    content="Search SSL/TLS certificates and Sigstore entries from transparency logs"
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Geist:wght@100;200;300;400;500;600;700;800;900&display=swap"
    rel="stylesheet"
  />
  <link
    href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100;200;300;400;500;600;700;800;900&display=swap"
    rel="stylesheet"
  />
  <link
    href="https://fonts.googleapis.com/css2?family=Noticia+Text:ital,wght@0,400;0,700;1,400;1,700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="noticia-text-regular flex h-screen flex-col bg-black text-white">
  <nav class="w-full bg-blue-900 px-4 py-2">
    <div class="flex flex-row pl-3 text-xs">
      <p>Internet Transparency Looking Glass</p>
      <div class="grow"></div>
      <p>
        <a href="https://routing.cafe" class="underline" target="_blank" rel="noopener noreferrer">
          routing.cafe
        </a>
      </p>
    </div>
    <Nav />
  </nav>
  <main class="flex-1 overflow-auto">
    {@render children()}
  </main>
</div>
