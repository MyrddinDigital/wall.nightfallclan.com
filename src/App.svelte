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
    // Control body overflow based on loading state
    if (loading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup function to reset overflow when component is destroyed
    return () => {
      document.body.style.overflow = '';
    };
  });

  $effect(() => {
    // Reading inputValue here establishes a dependency, so this effect re-runs
    const value = inputValue;
    const valueUser = inputValueUser;
    
    // Only debounce if the values are changing due to user input, not programmatic changes
    const isUserInput = document.activeElement?.tagName === 'INPUT';
    const delay = isUserInput ? 300 : 0;
    
    // Set loading state when search values change
    if (value !== query || valueUser !== queryUser) {
      loading = true;
    }
    
    const timeout = setTimeout(async () => {
      // Only update if values have changed
      if (value !== query || valueUser !== queryUser) {
        // Always reset pagination when search changes
        visibleStartIndex = 0;
        visibleEndIndex = postsPerLoad;
        
        // Update the query values
        query = value;
        queryUser = valueUser;
        
        // Scroll to top when there's an active search
        if (value || valueUser) {
          window.scrollTo(0, 0);
        }
        
        // Small delay to ensure loading state is shown
        await new Promise(resolve => setTimeout(resolve, 50));
        loading = false;
      }
    }, delay);
    
    return () => {
      clearTimeout(timeout);
    };
  });

  const SKELETON_COUNT = 15; // Number of skeleton posts to show when loading

  let posts: Posts = $state([])
  let loading = $state(true)

  let filteredPosts: Posts = $state([]);
  
  // Reactive statement to handle filtering
  $effect(() => {
    // Skip if we're already loading or posts aren't loaded yet
    if (loading || !posts.length) return;
    
    // Create a new array to trigger reactivity
    let result = [...posts];
    
    if (queryUser) {
      result = result.filter(post => 
        post.poster?.user.username.toLowerCase().includes(queryUser.toLowerCase())
      );
    }
    
    if (query) {
      result = result.filter(post => 
        post.body.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    filteredPosts = result;
  });
  let currentPagePosts: SanitizedPosts = $derived(sanitizePosts(filteredPosts.slice(visibleStartIndex, visibleEndIndex)))

  let showJumpToOldest = $derived(visibleStartIndex > 0);
  let showJumpToNewest = $derived(visibleEndIndex < filteredPosts.length);

  fetch('https://raw.githubusercontent.com/MerlinSoftworks/rbx-wall-archive/refs/heads/master/public/data/NFC.json').then(async res => {
    posts = await res.json();
    loading = false;
  })

  async function searchUser(username: string) {
    // Reset pagination first
    visibleStartIndex = 0;
    visibleEndIndex = postsPerLoad;
    
    // Set loading state immediately
    loading = true;
    
    // Force UI update by waiting for the next tick
    await tick();
    
    // Update the search values in the next microtask
    await Promise.resolve();
    inputValueUser = username;
    queryUser = username;
    
    // Scroll to top instantly when clicking a username
    window.scrollTo(0, 0);
    
    // Ensure loading state is shown for at least 100ms
    setTimeout(() => {
      loading = false;
    }, 100);
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

    const promise = fetch(`/.netlify/functions/roblox-proxy/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`)
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
    // First set the indices to show the oldest posts
    visibleStartIndex = 0;
    visibleEndIndex = postsPerLoad;
    
    // Force immediate scroll to top
    window.scrollTo({ top: 0 });
    
    // Then update the UI and smooth scroll if needed
    tick().then(() => {
      // Small delay to ensure the DOM has updated
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    });
  }

  function jumpToNewest() {
    // Jump to the end of the currently filtered list
    visibleStartIndex = Math.max(0, filteredPosts.length - postsPerLoad);
    visibleEndIndex = filteredPosts.length;

    // First do an immediate scroll to bottom
    window.scrollTo({ top: document.documentElement.scrollHeight });

    tick().then(() => {
      if (filteredPosts.length > 0) {
        const lastPost = filteredPosts[filteredPosts.length - 1];
        // A timeout gives the DOM a moment to catch up on large jumps
        setTimeout(() => {
          const element = document.getElementById(`post-${lastPost.id}`);
          if (element) {
            // Scroll to the element with some extra space at the bottom
            element.scrollIntoView({ behavior: 'instant', block: 'end' });
            // Add a small additional scroll to ensure we're at the very bottom
            setTimeout(() => {
              window.scrollBy({ top: 100, behavior: 'instant' });
            }, 0);
          } else {
            // Fallback if element not rendered for some reason
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
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
  {#if showJumpToOldest && !loading}
    <button class="jump-button jump-button--top" onclick={jumpToOldest}>Jump To Oldest</button>
  {/if}
  {#if posts}
    <div class="search-container">
      <div class="input-wrapper">
        <input type="text" bind:value={inputValue} placeholder="Search posts" id="search-posts" oninput={() => { loading = true; setTimeout(() => loading = false, 500); }} />
        {#if inputValue}
          <button class="clear-button" onclick={async (e) => {
            e.preventDefault();
            inputValue = '';
            loading = true;
            await tick();
            window.scrollTo(0, 0);
            setTimeout(() => loading = false, 100);
            document.getElementById('search-posts')?.focus();
          }}>&times;</button>
        {/if}
      </div>
      <div class="input-wrapper">
        <input type="text" bind:value={inputValueUser} placeholder="Search users" id="search-users" oninput={() => { loading = true; setTimeout(() => loading = false, 500); }} />
        {#if inputValueUser}
          <button class="clear-button" onclick={async (e) => {
            e.preventDefault();
            inputValueUser = '';
            loading = true;
            await tick();
            window.scrollTo(0, 0);
            setTimeout(() => loading = false, 100);
            document.getElementById('search-users')?.focus();
          }}>&times;</button>
        {/if}
      </div>

      {#if filteredPosts.length === 0}
        <p>No posts found</p>
      {:else if filteredPosts.length === 1}
        <p>Showing one single lonely post</p>
      {:else}
        <p>Showing {filteredPosts.length.toLocaleString()} posts</p>
      {/if}
    </div>
    


    {#if visibleStartIndex > 0}
      <div use:observeTop class="sentinel"></div>
    {/if}

    {#if loading}
      {#each Array(SKELETON_COUNT) as _, i}
        <div class="post post--skeleton">
          <div class="post__avatar post__avatar--loading"></div>
          <div class="post__content">
            <div class="post__user-date-container">
              <div class="skeleton skeleton-user"></div>
              <div class="skeleton skeleton-date"></div>
            </div>
            <div class="skeleton skeleton-body"></div>
          </div>
        </div>
      {/each}
    {:else}
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
              <span class="post__date">
                {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(post.created))}, 
                {new Date(post.created).getFullYear()} at 
                {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(post.created))}
              </span>
            </div>

            <p class="post__body">{@html post.body}</p>
          </div>
        </div>
      {/each}
    {/if}

    {#if visibleEndIndex < filteredPosts.length}
      <div use:observeBottom class="sentinel"></div>
    {/if}
  {/if}

  {#if showJumpToNewest && !loading}
    <button class="jump-button jump-button--bottom" onclick={jumpToNewest}>Jump To Newest</button>
  {/if}
</main>

<style lang="scss">
  main {
    max-width: 970px;
    width: 85vw;
    margin-bottom: 50px;
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
    align-items: flex-start;
    justify-content: flex-start;
    gap: 15px;
    margin-bottom: 10px;
    background-color: #191a1f;
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
      background-color: #2d2d2d;
      border: 2px solid #1d1d1d;
    }

    &__content {
      display: flex;
      flex-direction: column;
      width: calc(100% - 60px);
    }

    &__user-date-container {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;

      @media (min-width: 768px) {
        flex-direction: row;
        align-items: center;
        gap: 10px;
      }
    }

    &__user {
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      color: #8183ec;
      font-weight: 600;
      transition: color 0.2s ease;
      
      &:hover {
        text-decoration: dotted underline;
        text-underline-offset: 2px;
        text-decoration-thickness: 2px;
        text-decoration-color: #8183ec;
      }
    }

    &__date {
      color: #94a3b8;
      line-height: 1;
    }

    &__body {
      margin: 0;
      text-align: left;
      overflow-wrap: break-word;
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
    flex-direction: row;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;

    position: sticky;
    top: 0;
    z-index: 10;
    
    padding: 1rem;
    background: #121215; /* Dark background for sticky header */
  }

  @media (max-width: 768px) {
    .search-container {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    
    .search-container > p {
      text-align: center;
      padding: 0;

      @media (min-width: 768px) {
        padding: 0.5rem 0;
      }
    }
  }

  .search-container > .input-wrapper {
    flex-grow: 1;
    position: relative;
    min-width: 150px; /* Ensure input fields don't get too narrow */
  }

  .input-wrapper input {
    width: 100%;
    padding: 10px;
    padding-right: 2rem; /* Make space for the button */
    border-radius: 5px;
    background: #232326;
    color: #fff;
    box-sizing: border-box;
    transition: all 0.2s ease-out;
    border: none;

    &:focus {
      outline: none;
      background-color: #fff;
      color: #121215;
    }
  }

  .clear-button {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: #475569;
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
    background-color: #846cff;
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
    margin: 0 auto;
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
    top: 10.5rem; /* Below the sticky header */

    @media (min-width: 768px) {
      top: 5rem;
    }
  }

  .jump-button--bottom {
    bottom: 1rem;
  }
.post--skeleton {
  pointer-events: none;
  opacity: 0.8;
}
.skeleton {
  background: linear-gradient(90deg, #232326 25%, #2d2d2d 37%, #232326 63%);
  background-size: 400% 100%;
  animation: shimmer 1.2s linear infinite;
  border-radius: 4px;
  margin-bottom: 8px;
}
.skeleton-user {
  width: 120px;
  height: 16px;
  margin-bottom: 8px;
}
.skeleton-date {
  width: 90px;
  height: 14px;
  margin-bottom: 10px;
}
.skeleton-body {
  width: 100%;
  height: 24px;
  margin-bottom: 0;
}
@keyframes shimmer {
  0% {
    background-position: -400px 0;
  }
  100% {
    background-position: 400px 0;
  }
}

</style>
