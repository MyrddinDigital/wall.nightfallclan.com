<script lang="ts">
  import { LocalStoragePreset } from 'lowdb/browser'
  import type { LowSync } from 'lowdb'

  type Post = {
    id: number;
    poster?: {
      user: {
        userId: number;
        username: string;
        displayName: string;
      }
    },
    body: string;
    created: string;
  }

  type Posts = Post[]

  const postsPerPage = 10

  let db: LowSync<Posts> | undefined = $state()
  let page = $state(1)
  let posts: Posts = $derived(db?.data.slice((page - 1) * postsPerPage, page * postsPerPage) ?? [])

  fetch('/data/NFC.json').then(async res => {
    const data = await res.json()
    db = LocalStoragePreset<Posts>('posts', data)
  })
</script>

<main>
  {#if db?.data}
    {#each posts as post}
      <div>
        <p>{post.poster?.user.displayName}</p>
        <p>{post.body}</p>
        <p>{new Date(post.created).toLocaleString()}</p>
      </div>
    {/each}

    <button onclick={() => page--}>Previous</button>
    {page} / {Math.ceil(db.data.length / postsPerPage)}
    <button onclick={() => page++}>Next</button>
  {/if}
</main>

<style>
  button {
    margin: 0 10px;
  }
</style>
