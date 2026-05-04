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

<style scoped>
/* 分页容器 - 去掉背景，让按钮直接浮在页面背景上 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  padding: 0.5em;
  margin: 1em auto;
}

.pagination ul {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  box-shadow: none;
}

.pagination li {
  display: inline-block;
}

.pagination li a,
.pagination li span {
  display: inline-block;
  line-height: 2em;
  min-width: 2.5em;
  padding: 0 0.5em;
  color: #ddd;
  text-shadow: -1px -1px 0 #000;
  text-align: center;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}

/* 普通按钮 - 与 SearchBar .button 风格一致 */
.pagination li a {
  background-color: #204650;
  background-image: linear-gradient(to bottom, #275660 0, #183640 100%);
  box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.33);
}

.pagination li a:hover {
  background-image: linear-gradient(to bottom, #2a6470 0, #1a4050 100%);
}

.pagination li a:active {
  background-image: linear-gradient(to bottom, #183640 0, #275660 100%);
}

/* 激活状态 - 使用高亮渐变 */
.pagination li.active a,
.pagination li.active span {
  background-color: #4a8050;
  background-image: linear-gradient(to bottom, #5a9060 0, #3a7040 100%);
  box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.33);
  color: #fff;
  cursor: default;
}

/* 禁用状态 */
.pagination li.disabled a,
.pagination li.disabled span {
  background-color: rgba(40, 40, 40, 0.5);
  background-image: none;
  color: #666;
  cursor: default;
  opacity: 0.6;
  box-shadow: none;
}

/* 省略号 */
.pagination li span {
  background: transparent;
  color: #888;
  cursor: default;
  box-shadow: none;
}

/* 总条目数 - 与分页器风格统一 */
.pagination-notice {
  color: #aaa;
  font-weight: 500;
  font-size: 0.9em;
  margin-left: 1em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}
</style>
