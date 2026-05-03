<template>
  <Teleport to="body">
    <Transition name="dropdown">
      <div
        v-if="visible"
        class="collection-dropdown"
        :style="dropdownStyle"
        @click.stop
      >
        <!-- Loading state -->
        <div
          v-if="isLoading"
          class="dropdown-loading"
        >
          <i class="fas fa-spinner fa-spin" />
          <span>加载中...</span>
        </div>
        <!-- Collection list with checkboxes -->
        <template v-else>
          <div
            v-for="collection in collections"
            :key="collection.id"
            class="dropdown-item"
            :class="{ selected: isInCollection(collection.id) }"
            @click="toggleCollection(collection.id)"
          >
            <i
              v-if="isInCollection(collection.id)"
              class="fas fa-check"
            />
            <i
              v-else
              class="far fa-square"
            />
            <span>{{ collection.name }}</span>
            <i
              v-if="collection.isDefault"
              class="fas fa-star default-star"
              title="默认收藏夹"
            />
            <button
              v-if="isInCollection(collection.id) && !collection.isDefault"
              class="remove-btn"
              @click.stop="removeFromCollection(collection.id)"
            >
              <i class="fas fa-times" />
            </button>
          </div>
          <!-- Empty state -->
          <div
            v-if="collections.length === 0 && !isLoading"
            class="dropdown-empty"
          >
            暂无收藏夹
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFavorites, useCollections } from '@/composables'
import type { WallpaperItem } from '@/types'

interface Props {
  wallpaperId: string
  wallpaperData: WallpaperItem
  visible: boolean
  position: { x: number; y: number }
}

const props = defineProps<Props>()

defineEmits<{
  close: []
}>()

// Composables
const { favorites, add: addFavorite, remove: removeFavorite, load: loadFavorites } = useFavorites()

const { collections, load: loadCollections } = useCollections()

// Local loading state - prevents UI flash on first open
const isLoading = ref(false)

// Track if we've attempted to load data (prevents duplicate loads)
const hasAttemptedLoad = ref(false)

// Load data when dropdown becomes visible
watch(
  () => props.visible,
  async (visible) => {
    console.log('[CollectionDropdown] visible changed:', visible, 'collections length:', collections.value.length)
    if (visible && !hasAttemptedLoad.value) {
      hasAttemptedLoad.value = true
      // Only show loading if data isn't already available
      if (collections.value.length === 0) {
        isLoading.value = true
        try {
          await Promise.all([loadCollections(), loadFavorites()])
          console.log('[CollectionDropdown] Data loaded. collections:', collections.value.length, 'favorites:', favorites.value.length)
        } finally {
          isLoading.value = false
        }
      }
    }
  },
  { immediate: true },
)

// Computed
const dropdownStyle = computed(() => ({
  position: 'fixed' as const,
  left: `${props.position.x}px`,
  top: `${props.position.y}px`,
  zIndex: 1000,
}))

// Methods
const isInCollection = (collectionId: string): boolean => {
  const result = favorites.value.some(
    (f) => f.wallpaperId === props.wallpaperId && f.collectionId === collectionId,
  )
  return result
}

const toggleCollection = async (collectionId: string): Promise<void> => {
  console.log('[CollectionDropdown] toggleCollection called', {
    collectionId,
    wallpaperId: props.wallpaperId,
    wallpaperData: props.wallpaperData,
    isInCollection: isInCollection(collectionId),
    favoritesCount: favorites.value.length,
  })
  if (isInCollection(collectionId)) {
    // Already in collection - do nothing on click (use remove button)
    console.log('[CollectionDropdown] Already in collection, skipping')
  } else {
    console.log('[CollectionDropdown] Calling addFavorite...')
    const result = await addFavorite(props.wallpaperId, collectionId, props.wallpaperData)
    console.log('[CollectionDropdown] addFavorite result:', result)
  }
}

const removeFromCollection = async (collectionId: string): Promise<void> => {
  console.log('[CollectionDropdown] removeFromCollection called', { collectionId, wallpaperId: props.wallpaperId })
  await removeFavorite(props.wallpaperId, collectionId)
}
</script>

<style scoped>
.collection-dropdown {
  width: 180px;
  background: #2a2a2a;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  transform-origin: top left;
}

.dropdown-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: #888;
  font-size: 13px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s;
  color: #fff;
  font-size: 14px;
}

.dropdown-item:hover {
  background: #3a3a3a;
}

.dropdown-item.selected {
  color: #667eea;
}

.default-star {
  color: #d4af37;
  font-size: 0.8em;
  margin-left: auto;
}

.dropdown-item i {
  width: 16px;
  text-align: center;
}

.dropdown-item span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  background: none;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  padding: 2px 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.dropdown-item.selected:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  color: #ff4757;
}

.dropdown-empty {
  padding: 12px;
  text-align: center;
  color: #888;
  font-size: 13px;
}

/* macOS-style dropdown animation */
.dropdown-enter-active {
  animation: dropdown-open 0.2s ease-out;
}

.dropdown-leave-active {
  animation: dropdown-close 0.15s ease-in;
}

@keyframes dropdown-open {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes dropdown-close {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.8) translateY(-8px);
  }
}
</style>
