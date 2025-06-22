<script lang="ts">
  import { tick } from 'svelte';
  type Poster = {
    user: {
      userId: number;
      username: string;
      displayName: string;
    }
  }

  type Post = {
    id: number;
    poster?: Poster;
    body: string;
    created: string;
  }

  type SanitizedPost = Post & {
    poster: Poster;
  }

  type Posts = Post[]
  type SanitizedPosts = SanitizedPost[]

  const postsPerLoad = 20;
  let visibleStartIndex = $state(0);
  let visibleEndIndex = $state(postsPerLoad);

  let query = $state('')
  let inputValue = $state('')

  let queryUser = $state('')
  let inputValueUser = $state('')

  let highlightedPostId = $state(0)

  $effect(() => {
    // Reading inputValue here establishes a dependency, so this effect re-runs
    const value = inputValue;
    const valueUser = inputValueUser;
    const timeout = setTimeout(() => {
      query = value;
      queryUser = valueUser;
      
      // Only reset scroll if there's an active query. This prevents a race condition with gotoContext.
      if (value || valueUser) {
        visibleStartIndex = 0;
        visibleEndIndex = postsPerLoad;
      }
    }, 300);
    return () => {
      clearTimeout(timeout);
    };
  });

  let posts: Posts = $state([])
  let filteredPosts: Posts = $derived.by(() => {
    let filteredPosts: Posts = posts;

    if (!query && !queryUser) return posts;
    if (queryUser) filteredPosts = filteredPosts.filter(post => post.poster?.user.username.toLowerCase().includes(queryUser.toLowerCase()));
    if (query) filteredPosts = filteredPosts.filter(post => post.body.toLowerCase().includes(query.toLowerCase()));

    return filteredPosts
  })
  let currentPagePosts: SanitizedPosts = $derived(sanitizePosts(filteredPosts.slice(visibleStartIndex, visibleEndIndex)))

  let showJumpToOldest = $derived(visibleStartIndex > 0);
  let showJumpToNewest = $derived(visibleEndIndex < filteredPosts.length);

  fetch('/data/NFC.json').then(async res => {
    posts = await res.json()
  })

  function searchUser(username: string) {
    inputValueUser = username;
    queryUser = username;
  }

  function sanitizePosts(posts: Posts): SanitizedPosts {
    const sanitizedPosts: SanitizedPosts = []

    posts.forEach(post => {
      sanitizedPosts.push({
        ...post,
        poster: post.poster || {
          user: {
            userId: 1,
            username: 'Banned User',
            displayName: 'Banned User'
          }
        }
      })
      // post.body = post.body.linkify()
    })

    return sanitizedPosts
  }

  const avatarCache = new Map<number, Promise<string>>();

  function getAvatar(userId: number) {
    if (avatarCache.has(userId)) {
      return avatarCache.get(userId)!;
    }

    const promise = fetch(`/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        const imageUrl = data?.data?.[0]?.imageUrl;
        if (!imageUrl) {
          throw new Error(`Avatar URL not found for user ${userId}`);
        }
        return imageUrl;
      });
      
    avatarCache.set(userId, promise);
    return promise;
  }
  function observeTop(node: HTMLElement) {
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && visibleStartIndex > 0) {
        const oldScrollHeight = document.documentElement.scrollHeight;
        const oldScrollTop = document.documentElement.scrollTop;

        visibleStartIndex = Math.max(0, visibleStartIndex - postsPerLoad);
        await tick();

        const newScrollHeight = document.documentElement.scrollHeight;
        window.scrollTo(0, oldScrollTop + (newScrollHeight - oldScrollHeight));
      }
    });
    observer.observe(node);
    return { destroy: () => observer.unobserve(node) };
  }

  function observeBottom(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleEndIndex < filteredPosts.length) {
        visibleEndIndex = Math.min(filteredPosts.length, visibleEndIndex + postsPerLoad);
      }
    });
    observer.observe(node);
    return { destroy: () => observer.unobserve(node) };
  }

  function jumpToOldest() {
    visibleStartIndex = 0;
    visibleEndIndex = postsPerLoad;

    tick().then(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function jumpToNewest() {
    // Jump to the end of the currently filtered list
    visibleStartIndex = Math.max(0, filteredPosts.length - postsPerLoad);
    visibleEndIndex = filteredPosts.length;

    tick().then(() => {
      if (filteredPosts.length > 0) {
        const lastPost = filteredPosts[filteredPosts.length - 1];
        // A timeout gives the DOM a moment to catch up on large jumps
        setTimeout(() => {
          const element = document.getElementById(`post-${lastPost.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'end' });
          } else {
            // Fallback if element not rendered for some reason
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          }
        }, 50);
      }
    });
  }

  function gotoContext(id: number) {
    // Clear all filters immediately to ensure the target post will be in the list
    inputValue = '';
    inputValueUser = '';
    query = '';
    queryUser = '';

    const postIndex = posts.findIndex(post => post.id === id);
    if (postIndex === -1) return;

    const windowSize = 10;
    visibleStartIndex = Math.max(0, postIndex - windowSize);
    visibleEndIndex = Math.min(posts.length, postIndex + windowSize + 1);
    highlightedPostId = id;

    // Wait for the DOM to update, then poll for the element
    tick().then(() => {
      const maxAttempts = 20; // 20 * 100ms = 2 seconds timeout
      let attempt = 0;
      const interval = setInterval(() => {
        const element = document.getElementById(`post-${id}`);
        if (element) {
          clearInterval(interval);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            if (highlightedPostId === id) {
              highlightedPostId = 0;
            }
          }, 2000);
        } else if (++attempt >= maxAttempts) {
          clearInterval(interval);
        }
      }, 100);
    });
  }
</script>

<main>
  {#if showJumpToOldest}
    <button class="jump-button jump-button--top" onclick={jumpToOldest}>Jump To Oldest</button>
  {/if}
  {#if posts}
    <div class="search-container">
      <div class="input-wrapper">
        <input type="text" bind:value={inputValue} placeholder="Search posts" />
        {#if inputValue}
          <button class="clear-button" onclick={() => inputValue = ''}>&times;</button>
        {/if}
      </div>
      <div class="input-wrapper">
        <input type="text" bind:value={inputValueUser} placeholder="Search users" />
        {#if inputValueUser}
          <button class="clear-button" onclick={() => inputValueUser = ''}>&times;</button>
        {/if}
      </div>
      <p>Showing {filteredPosts.length.toLocaleString()} posts</p>
    </div>
    


    {#if visibleStartIndex > 0}
      <div use:observeTop class="sentinel"></div>
    {/if}

    {#each currentPagePosts as post}
      <div id="post-{post.id}" class="post {post.id === highlightedPostId ? 'post--highlighted' : ''}">
        {#if queryUser || query}
          <button class="context-jump" onclick={() => gotoContext(post.id)}>Jump</button>
        {/if}
        <a href={`https://www.roblox.com/users/${post.poster.user.userId}/profile`} class="post__avatar-container" target="_blank" rel="noopener noreferrer">
          {#await getAvatar(post.poster.user.userId)}
            <div class="post__avatar post__avatar--loading"></div>
          {:then avatarUrl}
            <img class="post__avatar" src={avatarUrl} alt="">
          {:catch error}
            <div class="post__avatar post__avatar--loading"></div>
          {/await}
        </a>

        <div class="post__content">
          <div class="post__user-date-container">
            <button class="post__user" onclick={() => searchUser(post.poster.user.username)}>
              { post.poster.user.username }
            </button>
            <span class="post__date">{new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(post.created))}</span>
          </div>

          <p class="post__body">{@html post.body}</p>
        </div>
      </div>
    {/each}

    {#if visibleEndIndex < filteredPosts.length}
      <div use:observeBottom class="sentinel"></div>
    {/if}
  {/if}

  {#if showJumpToNewest}
    <button class="jump-button jump-button--bottom" onclick={jumpToNewest}>Jump To Newest</button>
  {/if}
</main>

<style lang="scss">
  main {
    max-width: 970px;
    width: 85vw;
  }

  span {
    font-size: 0.85rem;
    opacity: 0.5;
  }

  button {
    margin: 0 10px;
  }



  .context-jump {
    font-family: Helvetica, Arial, sans-serif;
    position: absolute;
    right: 0;
    top: 10px;
    background: none;
    font-size: 0.7rem;
    background-color: #fff;
    border: none;
    color: black;
    font-weight: bold;
    border-radius: 9999px;
    padding: 5px 15px;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;
  }

  .post:hover .context-jump {
    opacity: 1;
    visibility: visible;
  }
    

  .post {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    margin-bottom: 20px;
    background-color: #2b2b2b;
    padding: 15px;
    border-radius: 10px;
    transition: all 0.2s ease;

    &--highlighted {
      background-color: #3d3d3d;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
    }

    &__avatar-container {
      width: 50px;
      height: 50px;
      border-radius: 50%;
    }

    &__avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: #464646;
    }

    &__content {
      display: flex;
      flex-direction: column;
    }

    &__user-date-container {
      display: flex;
      flex-direction: row;
      gap: 10px;
    }

    &__user {
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
    }

    &__date {
      opacity: 0.5;
    }

    &__body {
      margin: 0;
      text-align: left;
    }
  }

  @keyframes shimmer {
    0% {
      background-position: -100% 0;
    }
    100% {
      background-position: 100% 0;
    }
  }

  .post__avatar--loading {
    background: linear-gradient(to right, #3c3c3c 8%, #444444 18%, #3c3c3c 33%);
    background-size: 200% 100%;
    animation: shimmer 1.5s linear infinite;
  }
  .sentinel {
    height: 1px;
  }

  .search-container {
    display: flex;
    gap: 1rem;
    align-items: center;

    position: sticky;
    top: 0;
    z-index: 10;
    
    padding: 1rem;
    background: #242424; /* Dark background for sticky header */
  }

  .search-container > .input-wrapper {
    flex-grow: 1;
    position: relative;
  }

  .input-wrapper input {
    width: 100%;
    padding: 10px;
    padding-right: 2rem; /* Make space for the button */
    border: 2px solid #2b2b2b;
    border-radius: 5px;
    background: #2b2b2b;
    color: #fff;
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: #fff;
    }
  }

  .clear-button {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: #565656;
    color: #ddd;
    border: none;
    border-radius: 50%;
    width: 1.25rem;
    height: 1.25rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;

    /* Use flexbox for perfect centering */
    display: flex;
    line-height: 18px;
    justify-content: center;
    padding: 0;
  }

  .clear-button:hover {
    background-color: #999;
    color: white;
  }

  .search-container > p {
    margin: 0;
    white-space: nowrap;
  }

  .jump-button {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: bold;

    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;

    background-color: white;
    color: #1e1e1e;
    border: none;
    border-radius: 9999px; /* pill shape */
    padding: 0.5rem 1rem;
    cursor: pointer;
  }

  .jump-button--top {
    top: 5rem; /* Below the sticky header */
  }

  .jump-button--bottom {
    bottom: 1rem;
  }
</style>
