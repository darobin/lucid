<script lang="ts">
  import {onMount} from "svelte"
  import {writable} from "@welshman/lib"
  import type {Filter} from "@welshman/util"
  import {createScroller, synced} from "src/util/misc"
  import {fly, fade} from "src/util/transition"
  import Anchor from "src/partials/Anchor.svelte"
  import Spinner from "src/partials/Spinner.svelte"
  import FlexColumn from "src/partials/FlexColumn.svelte"
  import Note from "src/app/shared/Note.svelte"
  import FeedControls from "src/app/shared/FeedControls.svelte"
  import {FeedLoader} from "src/app/util"
  import type {Feed} from "src/domain"

  export let feed: Feed
  export let anchor = null
  export let eager = false
  export let contextAddress = null
  export let skipCache = false
  export let skipNetwork = false
  export let skipPlatform = false
  export let shouldListen = false
  export let showControls = false
  export let hideSpinner = false
  export let includeReposts = false
  export let showGroup = false
  export let onEvent = null

  const shouldHideReplies = showControls ? synced("Feed.shouldHideReplies", false) : writable(false)

  const reload = async () => {
    loader?.stop()
    loader = new FeedLoader({
      anchor,
      onEvent,
      skipCache,
      skipNetwork,
      skipPlatform,
      shouldListen,
      includeReposts,
      shouldDefer: !eager,
      shouldLoadParents: true,
      shouldHideReplies: $shouldHideReplies,
      feed: feed.definition,
    })

    limit = 0
    done = loader.done
    notes = loader.notes
    filters = [{ids: []}]

    loader.start()
    loader.compiled.then(requests => {
      filters = requests.flatMap(r => r.filters || [])
    })
  }

  const toggleReplies = () => {
    $shouldHideReplies = !$shouldHideReplies
    reload()
  }

  const updateFeed = newFeed => {
    feed = newFeed
    reload()
  }

  const loadMore = async () => {
    limit += 5

    if ($notes.length < limit) {
      await loader.load(20)
    }
  }

  let element, loader, notes, done
  let filters: Filter[] = [{ids: []}]
  let limit = 0

  reload()

  onMount(() => {
    const scroller = createScroller(loadMore, {element})

    return () => {
      loader.stop()
      scroller.stop()
    }
  })
</script>

{#if showControls}
  <FeedControls {feed} {updateFeed}>
    <div slot="controls">
      {#if $shouldHideReplies}
        <Anchor button low class="border-none opacity-50" on:click={toggleReplies}>Replies</Anchor>
      {:else}
        <Anchor button accent class="border-none" on:click={toggleReplies}>Replies</Anchor>
      {/if}
    </div>
  </FeedControls>
{/if}

<FlexColumn xl bind:element>
  {#each $notes.slice(0, limit) as note, i (note.id)}
    <div in:fly={{y: 20}}>
      <Note
        depth={$shouldHideReplies ? 0 : 2}
        context={note.replies || []}
        {contextAddress}
        {showGroup}
        {filters}
        {anchor}
        {note} />
    </div>
  {/each}
</FlexColumn>

{#if !hideSpinner}
  {#if $done}
    <div transition:fly|local={{y: 20, delay: 500}} class="flex flex-col items-center py-24">
      <img class="h-20 w-20" src="/images/pumpkin.png" />
      That's all!
    </div>
  {:else}
    <div out:fade|local>
      <Spinner />
    </div>
  {/if}
{/if}
