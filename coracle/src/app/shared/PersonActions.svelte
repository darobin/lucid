<script lang="ts">
  import {nip19} from "nostr-tools"
  import {toNostrURI} from '@welshman/util'
  import Popover from "src/partials/Popover.svelte"
  import OverflowMenu from "src/partials/OverflowMenu.svelte"
  import {
    loginWithPublicKey,
    session,
    mute,
    hints,
    unmute,
    canSign,
    updateFollows,
    deriveMuted,
    deriveFollowing,
  } from "src/engine"
  import {boot} from "src/app/state"
  import {router} from "src/app/util/router"

  export let pubkey

  const isSelf = $session?.pubkey === pubkey
  const following = deriveFollowing(pubkey)
  const muted = deriveMuted(pubkey)

  let actions = []

  $: {
    actions = []

    if (!isSelf && $canSign) {
      actions.push({
        onClick: $muted ? unmutePerson : mutePerson,
        label: $muted ? "Unmute" : "Mute",
        icon: $muted ? "microphone-slash" : "microphone",
      })
    }

    if ($canSign) {
      actions.push({
        onClick: () => router.at("lists/select").qp({type: "p", value: pubkey}).open(),
        label: "Add to list",
        icon: "list",
      })
    }

    if (!isSelf && $canSign) {
      actions.push({
        onClick: () => router.at("notes/create").qp({pubkey}).open(),
        label: "Mention",
        icon: "at",
      })

      actions.push({
        onClick: () => router.at("channels").of([$session.pubkey, pubkey]).push(),
        label: "Message",
        icon: "envelope",
      })
    }

    if (!isSelf) {
      actions.push({onClick: loginAsUser, label: "Login as", icon: "right-to-bracket"})
    }

    actions.push({onClick: openProfileInfo, label: "Details", icon: "info"})

    if (isSelf && $canSign) {
      actions.push({
        onClick: () => router.at("settings/profile").open(),
        label: "Edit",
        icon: "edit",
      })
    }
  }

  const loginAsUser = () => {
    router.clearModals()
    loginWithPublicKey(pubkey)
    boot()
  }

  const openProfileInfo = () => router.at("people").of(pubkey).at("info").open()

  const unfollowPerson = () => updateFollows({remove: [pubkey]})

  const followPerson = () => updateFollows({add: [pubkey]})

  const unmutePerson = () => unmute(pubkey)

  const mutePerson = () => mute("p", pubkey)

  const share = () =>
    router
      .at("qrcode")
      .of(toNostrURI(nip19.nprofileEncode({pubkey, relays: hints.FromPubkeys([pubkey]).getUrls()})))
      .open()
</script>

<div class="flex items-center gap-3" on:click|stopPropagation>
  {#if !isSelf}
    <Popover triggerType="mouseenter">
      <div slot="trigger" class="w-6 cursor-pointer text-center">
        {#if $following}
          <i class="fa fa-user-minus" on:click={unfollowPerson} />
        {:else}
          <i class="fa fa-user-plus" on:click={followPerson} />
        {/if}
      </div>
      <div slot="tooltip">{$following ? "Unfollow" : "Follow"}</div>
    </Popover>
  {/if}
  <Popover triggerType="mouseenter">
    <div slot="trigger" class="w-6 cursor-pointer text-center">
      <i class="fa fa-share-nodes" on:click={share} />
    </div>
    <div slot="tooltip">Share</div>
  </Popover>
  <OverflowMenu {actions} />
</div>
