<script lang="ts">
  import {makeTagFeed} from "@welshman/feeds"
  import Feed from "src/app/shared/Feed.svelte"
  import Heading from "src/partials/Heading.svelte"
  import TopicActions from "src/app/shared/TopicActions.svelte"
  import {makeFeed} from "src/domain"

  export let topic
</script>

<div class="flex justify-between gap-2">
  <Heading>#{topic}</Heading>
  <div class="pt-5">
    <TopicActions {topic} />
  </div>
</div>
<Feed feed={makeFeed({definition: makeTagFeed("#t", topic)})} />
