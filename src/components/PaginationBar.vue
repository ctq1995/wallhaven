<template>
  <nav class="pagination">
    <ul>
      <!-- 上一页按钮 -->
      <li :class="{ disabled: props.currentPage <= 1 || props.loading }">
        <a
          v-if="props.currentPage > 1 && !props.loading"
          href="#"
          @click.prevent="handlePageClick(props.currentPage - 1)"
        >
          上一页
        </a>
        <span v-else>上一页</span>
      </li>

      <!-- 首页 -->
      <li
        v-if="props.totalPages > 1"
        :class="{ active: props.currentPage === 1 }"
      >
        <a
          href="#"
          @click.prevent="handlePageClick(1)"
        >1</a>
      </li>

      <!-- 左侧省略号 -->
      <li v-if="showStartEllipsis">
        <span>...</span>
      </li>

      <!-- 中间页码 -->
      <li
        v-for="page in visiblePages"
        v-show="page !== 1 && page !== props.totalPages"
        :key="page"
        :class="{ active: page === props.currentPage }"
      >
        <a
          href="#"
          @click.prevent="handlePageClick(page)"
        >{{ page }}</a>
      </li>

      <!-- 右侧省略号 -->
      <li v-if="showEndEllipsis">
        <span>...</span>
      </li>

      <!-- 末页 -->
      <li
        v-if="props.totalPages > 1"
        :class="{ active: props.currentPage === props.totalPages }"
      >
        <a
          href="#"
          @click.prevent="handlePageClick(props.totalPages)"
        >
          {{ props.totalPages }}
        </a>
      </li>

      <!-- 下一页按钮 -->
      <li :class="{ disabled: props.currentPage >= props.totalPages || props.loading }">
        <a
          v-if="props.currentPage < props.totalPages && !props.loading"
          href="#"
          @click.prevent="handlePageClick(props.currentPage + 1)"
        >
          下一页
        </a>
        <span v-else>下一页</span>
      </li>
    </ul>

    <!-- 总条目数 -->
    <span class="pagination-notice">
      共 {{ formatCount(props.totalCount) }} 张
    </span>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * PaginationBar 组件
 *
 * 分页导航组件，复用 list.css 的 .pagination 样式
 * 显示 5 个页码按钮（当前页左右各 2 个），支持省略号显示
 */

interface Props {
  currentPage: number // 当前页码（1-based）
  totalPages: number // 总页数
  totalCount: number // 总条目数
  loading?: boolean // 加载状态
}

interface Emits {
  (e: 'go-to-page', page: number): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<Emits>()

/**
 * 计算可见的页码列表
 * 显示 5 个页码按钮（当前页左右各 2 个）
 * 边界自适应：当前页靠近边界时扩展另一侧
 */
const visiblePages = computed(() => {
  if (props.totalPages <= 5) {
    // 总页数 ≤ 5，全部显示
    return Array.from({ length: props.totalPages }, (_, i) => i + 1)
  }

  // 计算显示范围
  let start = Math.max(1, props.currentPage - 2)
  let end = Math.min(props.totalPages, props.currentPage + 2)

  // 边界自适应
  if (props.currentPage <= 3) {
    end = 5
  } else if (props.currentPage >= props.totalPages - 2) {
    start = props.totalPages - 4
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

/**
 * 是否显示左侧省略号
 */
const showStartEllipsis = computed(() => {
  return props.totalPages > 5 && props.currentPage > 3
})

/**
 * 是否显示右侧省略号
 */
const showEndEllipsis = computed(() => {
  return props.totalPages > 5 && props.currentPage < props.totalPages - 2
})

/**
 * 格式化总条目数（添加千分位）
 */
function formatCount(count: number): string {
  return count.toLocaleString('zh-CN')
}

/**
 * 处理页码点击
 */
function handlePageClick(page: number): void {
  if (props.loading || page === props.currentPage) return
  emit('go-to-page', page)
}
</script>
