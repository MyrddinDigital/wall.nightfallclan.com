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

  let dateFilter = $state<{ start?: number, end?: number } | null>(null)


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

  function getDateFilter(operator: 'before' | 'after' | 'during', dateStr: string): { start?: number, end?: number } | null {
    // Replace hyphens with slashes to encourage local time parsing for YYYY-MM-DD formats
    const localDateStr = dateStr.replace(/-/g, '/');
    const parts = localDateStr.split('/');

    if (parts.length === 1 && /^\d{4}$/.test(parts[0])) { // YYYY
      const year = parseInt(parts[0], 10);
      const startDate = new Date(year, 0, 1).getTime();
      const endDate = new Date(year + 1, 0, 1).getTime();
      if (operator === 'before') return { end: startDate };
      if (operator === 'after') return { start: endDate };
      if (operator === 'during') return { start: startDate, end: endDate };
    } else if (parts.length === 2 && /^\d{4}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) { // YYYY/MM
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (month < 1 || month > 12) return null;
      const startDate = new Date(year, month - 1, 1).getTime();
      const nextMonth = new Date(year, month - 1, 1);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const endDate = nextMonth.getTime();
      if (operator === 'before') return { end: startDate };
      if (operator === 'after') return { start: endDate };
      if (operator === 'during') return { start: startDate, end: endDate };
    } else { // YYYY/MM/DD or other parsable format
      const parsedDate = new Date(localDateStr);
      if (isNaN(parsedDate.getTime())) return null;

      // Set time to beginning of the day in local timezone
      parsedDate.setHours(0, 0, 0, 0);
      const startDate = parsedDate.getTime();
      
      const nextDay = new Date(parsedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = nextDay.getTime();

      if (operator === 'before') return { end: startDate };
      if (operator === 'after') return { start: endDate };
      if (operator === 'during') return { start: startDate, end: endDate };
    }
    return null;
  }

  $effect(() => {
    const value = inputValue;
    
    const isUserInput = document.activeElement?.tagName === 'INPUT';
    const delay = isUserInput ? 300 : 0;

    const fromUserRegex = /\s*from:\s*(\S+)\s*/i;
    const beforeDateRegex = /\s*before:\s*(\S+)\s*/i;
    const afterDateRegex = /\s*after:\s*(\S+)\s*/i;
    const duringDateRegex = /\s*during:\s*(\S+)\s*/i;

    let newQuery = value;
    let newQueryUser = '';
    let newDateFilter: { start?: number, end?: number } = {};

    const fromMatch = newQuery.match(fromUserRegex);
    if (fromMatch) {
      newQueryUser = fromMatch[1];
      newQuery = newQuery.replace(fromUserRegex, '').trim();
    }

    const beforeMatch = newQuery.match(beforeDateRegex);
    if (beforeMatch) {
      const filter = getDateFilter('before', beforeMatch[1]);
      if (filter?.end) newDateFilter.end = filter.end;
      newQuery = newQuery.replace(beforeDateRegex, '').trim();
    }

    const afterMatch = newQuery.match(afterDateRegex);
    if (afterMatch) {
      const filter = getDateFilter('after', afterMatch[1]);
      if (filter?.start) newDateFilter.start = filter.start;
      newQuery = newQuery.replace(afterDateRegex, '').trim();
    }

    // `during` will override any before/after filters
    const duringMatch = newQuery.match(duringDateRegex);
    if (duringMatch) {
      const filter = getDateFilter('during', duringMatch[1]);
      if (filter) newDateFilter = filter;
      newQuery = newQuery.replace(duringDateRegex, '').trim();
    }
    
    const finalFilter = Object.keys(newDateFilter).length > 0 ? newDateFilter : null;

    // Set loading state when search values change
    if (newQuery !== query || newQueryUser !== queryUser || JSON.stringify(finalFilter) !== JSON.stringify(dateFilter)) {
      loading = true;
    }
    
    const timeout = setTimeout(async () => {
      // Only update if values have changed
      if (newQuery !== query || newQueryUser !== queryUser || JSON.stringify(finalFilter) !== JSON.stringify(dateFilter)) {
        // Always reset pagination when search changes
        visibleStartIndex = 0;
        visibleEndIndex = postsPerLoad;
        
        // Update the query values
        query = newQuery;
        queryUser = newQueryUser;
        dateFilter = finalFilter;
        
        // Scroll to top when there's an active search
        if (query || queryUser || dateFilter) {
          window.scrollTo(0, 0);
        }
        
        // Small delay to ensure loading state is shown
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      loading = false;
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

    const currentFilter = dateFilter;
    if (currentFilter) {
      result = result.filter(post => {
        const postTimestamp = new Date(post.created).getTime();
        if (isNaN(postTimestamp)) return false;

        if (currentFilter.start && postTimestamp < currentFilter.start) return false;
        if (currentFilter.end && postTimestamp >= currentFilter.end) return false;
        
        return true;
      });
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

    const fromUserRegex = /\s*from:\s*(\S+)\s*/i;
    const fromUserString = `from:${username}`;

    if (inputValue.match(fromUserRegex)) {
      inputValue = inputValue.replace(fromUserRegex, ` ${fromUserString} `).trim();
    } else {
      inputValue = `${inputValue} ${fromUserString}`.trim();
    }
    
    // Scroll to top instantly when clicking a username
    window.scrollTo(0, 0);
    
    // Ensure loading state is shown for at least 100ms
    setTimeout(() => {
      loading = false;
    }, 100);
  }

  /**
   * Escape HTML special characters to avoid accidental tag injection.
   */
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Convert raw post objects into SanitizedPosts with:
   * 1. Guaranteed poster property
   * 2. Body converted to safe HTML where URLs are linkified
   *    and Roblox forum links are redirected to archive.froast.io
   */
  function sanitizePosts(posts: Posts): SanitizedPosts {
    const urlRegex = /https?:\/\/[^\s<]+/g;

    return posts.map(post => {
      // Ensure we always have a poster object
      const safePoster: Poster = post.poster ?? {
        user: {
          userId: 1,
          username: 'Banned User',
          displayName: 'Banned User'
        }
      };

      const raw = post.body ?? '';
      let result = '';
      let lastIndex = 0;

      raw.replace(urlRegex, (match, offset) => {
        // Append the text before this URL, escaped
        result += escapeHtml(raw.slice(lastIndex, offset));

        // Strip trailing punctuation from the detected URL so it is not part of the link
        const trailingPunct = /[.,!?)]+$/.exec(match);
        const cleanUrl = trailingPunct ? match.slice(0, -trailingPunct[0].length) : match;
        const trailing = trailingPunct ? trailingPunct[0] : '';

        // Determine final href (handle legacy Roblox forum links)
        let href = cleanUrl;
        try {
          const u = new URL(cleanUrl);
          if (u.hostname.endsWith('roblox.com') && u.pathname === '/Forum/ShowPost.aspx') {
            const id = u.searchParams.get('PostID');
            if (id) href = `https://archive.froast.io/forum/${id}`;
          }
        } catch {
          /* ignore malformed urls */
        }

        // Append the anchor tag
        result += `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>${escapeHtml(trailing)}`;

        lastIndex = offset + match.length;
        return match;
      });

      // Append remaining text
      result += escapeHtml(raw.slice(lastIndex));

      return {
        ...post,
        poster: safePoster,
        body: result
      } as SanitizedPost;
    });
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
    
    // Then update the UI and smooth scroll if needed
    tick().then(() => {
      // Small delay to ensure the DOM has updated
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    });
  }

  function jumpToNewest() {
    // Set the indices to show the last page of posts
    visibleStartIndex = Math.max(0, filteredPosts.length - postsPerLoad);
    visibleEndIndex = filteredPosts.length;

    // Wait for Svelte to update the DOM with the new posts
    tick().then(() => {
        // Now that the DOM is updated, scroll to the bottom.
        // A small timeout can help ensure everything, including images, has had a chance to render.
        setTimeout(() => {
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth'
            });
        }, 50); // A small delay to let images render
    });
  }

  let lastScrollY = 0;
  let scrollDirection = $state<'up' | 'down' | null>(null);

  function handleScroll() {
    const currentScrollY = window.scrollY;
    if (currentScrollY <= 0) {
      // Reset at the top
      lastScrollY = 0;
      scrollDirection = null;
      return;
    }

    // Add a small threshold to prevent firing on minor scrolls
    if (Math.abs(currentScrollY - lastScrollY) < 10) {
      return;
    }

    if (currentScrollY > lastScrollY) {
      scrollDirection = 'down';
    } else if (currentScrollY < lastScrollY) {
      scrollDirection = 'up';
    }
    lastScrollY = currentScrollY;
  }

  function gotoContext(id: number) {
    // Clear all filters immediately to ensure the target post will be in the list
    inputValue = '';
    query = '';
    queryUser = '';
    dateFilter = null;

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

<svelte:window on:scroll={handleScroll} />
<main>
  {#if showJumpToOldest && !loading}
    <button class="jump-button jump-button--top" class:hidden={scrollDirection === 'down'} onclick={jumpToOldest}>Jump To Oldest</button>
  {/if}
  {#if posts}
    <div class="search-container">
      <div class="input-wrapper">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" bind:value={inputValue} placeholder="Search" id="search-posts" />
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
    </div>

    <div class="post-count">
      {#if loading}
        <p>Loading</p>
      {:else if filteredPosts.length === 0}
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
          {#if queryUser || query || dateFilter}
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
    <button class="jump-button jump-button--bottom" class:hidden={scrollDirection === 'up'} onclick={jumpToNewest}>Jump To Newest</button>
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
    font-family: 'Helvetica Neue', Helvetica, Arial, Lucida Grande, sans-serif;
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 15px;
    margin-bottom: 10px;
    background-color: #191a1f;
    padding: 15px;
    border-radius: 8px;
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
      gap: 7px;
      margin-bottom: 5px;

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
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      transition: color 0.2s ease;
    }

    &__date {
      color: #94a3b8;
      line-height: 1;
      font-size: 12px;
      font-weight: 600;
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
    animation: shimmer 4s linear infinite;
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
    font-size: 16px;

    &:focus {
      outline: none;
      background-color: #fff;
      color: #121215;
    }
  }

  .post-count p {
    margin-top: 0;
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
    z-index: 5;

    background-color: white;
    color: #1e1e1e;
    border: none;
    border-radius: 9999px; /* pill shape */
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: all 0.3s ease-in-out;

    &.hidden {
      opacity: 0;
      pointer-events: none;
    }
  }

  .jump-button--top {
    top: 5rem;

    &.hidden {
      transform: translateX(-50%) translateY(-200%);
    }
  }

  .jump-button--bottom {
    bottom: 1rem;

    &.hidden {
      transform: translateX(-50%) translateY(200%);
    }
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

  .input-wrapper {
    position: relative;
  }

  #search-posts {
    padding-left: 40px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #cdcdcd;
    pointer-events: none;
    transition: color 0.2s ease;
  }

  .input-wrapper:has(input:focus) .search-icon {
    color: #121215;
  }
</style>
