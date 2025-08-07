// ==================== 类型定义 ====================

export interface WeightConfig {
  exactMatch: number;
  prefixMatch: number;
  containsMatch: number;
  charSimilarity: number;
  lengthSimilarity: number;
  wordBoundary: number;
  substringMatch: number;
  commonPrefix: number;
}

export interface SearchOptions {
  minScore?: number;
  caseSensitive?: boolean;
  weightConfig?: Partial<WeightConfig>;
  enableCache?: boolean;
  maxEditDistance?: number;
}

export interface MatchDetails {
  exactMatch: boolean;
  prefixMatch: boolean;
  containsMatch: boolean;
  charSimilarity: number;
  lengthSimilarity: number;
  editSimilarity: number;
  wordMatches?: number;
}

export interface SearchResult<T = any> {
  item: T;
  score: number;
  details: MatchDetails;
}

export type SearchableItem = Record<string, any>;

export const DEFAULT_WEIGHT_CONFIG: WeightConfig = {
  exactMatch: 1.0,
  prefixMatch: 0.8,
  containsMatch: 0.6,
  charSimilarity: 0.4,
  lengthSimilarity: 0.2,
  wordBoundary: 0.7,
  substringMatch: 0.9,
  commonPrefix: 0.85
};

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  minScore: 0.3,
  caseSensitive: false,
  weightConfig: DEFAULT_WEIGHT_CONFIG,
  enableCache: true,
  maxEditDistance: 10
};

// ==================== 主要函数 ====================

/**
 * 智能模糊搜索方法（性能优化版）
 */
export function smartFuzzySearch<T extends SearchableItem>(
  list: T[],
  field: keyof T,
  searchTerm: string,
  options: SearchOptions = {}
): T | null {
  if (!list || !Array.isArray(list) || !field || !searchTerm) {
    return null
  }

  const {
    minScore = 0.3,
    caseSensitive = false,
    weightConfig: userWeightConfig = {},
    enableCache = true,
    maxEditDistance = 10
  } = options

  // 合并用户配置和默认配置
  const weightConfig: WeightConfig = { ...DEFAULT_WEIGHT_CONFIG, ...userWeightConfig }

  // 缓存机制
  const cache = new Map<string, number>()

  // 预处理搜索词
  const normalizedSearchTerm = caseSensitive
    ? searchTerm
    : searchTerm.toLowerCase()
  const searchWords = normalizedSearchTerm
    .split(/[\s,，。.]+/)
    .filter((word) => word.length > 0)

  // 快速预筛选：如果搜索词太短，直接返回null
  if (normalizedSearchTerm.length < 2) {
    return null
  }

  // 计算每个项目的匹配分数
  const scoredItems = list.map((item): SearchResult<T> => {
        const fieldValue = item[field]
    if (!fieldValue) return {
      item,
      score: 0,
      details: {
        exactMatch: false,
        prefixMatch: false,
        containsMatch: false,
        charSimilarity: 0,
        lengthSimilarity: 0,
        editSimilarity: 0
      }
    }

    const fieldValueStr = String(fieldValue)
    const normalizedFieldValue = caseSensitive
      ? fieldValueStr
      : fieldValueStr.toLowerCase()

    // 快速长度检查：如果长度差异太大，跳过
    const lengthDiff = Math.abs(
      normalizedFieldValue.length - normalizedSearchTerm.length
    )
    if (lengthDiff > maxEditDistance * 2) {
      return {
        item,
        score: 0,
        details: {
          exactMatch: false,
          prefixMatch: false,
          containsMatch: false,
          charSimilarity: 0,
          lengthSimilarity: 0,
          editSimilarity: 0
        }
      }
    }

    let maxScore = 0
    const fieldWords = normalizedFieldValue
      .split(/[\s,，。.]+/)
      .filter((word) => word.length > 0)

    // 1. 完全匹配检查（最高优先级）
    if (normalizedFieldValue === normalizedSearchTerm) {
      return {
        item,
        score: weightConfig.exactMatch,
        details: {
          exactMatch: true,
          prefixMatch: true,
          containsMatch: true,
          charSimilarity: 1,
          lengthSimilarity: 1,
          editSimilarity: 1
        }
      }
    }

    // 2. 前缀匹配检查
    if (
      normalizedFieldValue.startsWith(normalizedSearchTerm) ||
      normalizedSearchTerm.startsWith(normalizedFieldValue)
    ) {
      maxScore = Math.max(maxScore, weightConfig.prefixMatch)
    }

    // 3. 包含匹配检查
    if (
      normalizedFieldValue.includes(normalizedSearchTerm) ||
      normalizedSearchTerm.includes(normalizedFieldValue)
    ) {
      maxScore = Math.max(maxScore, weightConfig.containsMatch)
    }

    // 4. 子串匹配检查（新增）- 检查搜索词是否是目标词的子串
    const substringScore = calculateSubstringMatch(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    if (substringScore > 0) {
      maxScore = Math.max(
        maxScore,
        substringScore * weightConfig.substringMatch
      )
    }

    // 5. 共同前缀匹配（新增）- 计算最长的共同前缀
    const commonPrefixScore = calculateCommonPrefix(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    if (commonPrefixScore > 0) {
      maxScore = Math.max(
        maxScore,
        commonPrefixScore * weightConfig.commonPrefix
      )
    }

    // 4. 词边界匹配检查（优化版）
    if (searchWords.length > 0) {
      const searchWordMatches = searchWords.filter((searchWord) =>
        fieldWords.some(
          (fieldWord) =>
            fieldWord.includes(searchWord) || searchWord.includes(fieldWord)
        )
      ).length

      if (searchWordMatches > 0) {
        const wordMatchScore =
          (searchWordMatches / searchWords.length) * weightConfig.wordBoundary
        maxScore = Math.max(maxScore, wordMatchScore)
      }
    }

    // 5. 字符相似度计算（缓存优化）
    let charSimilarity = 0
    const cacheKey = `char_${normalizedFieldValue}_${normalizedSearchTerm}`

    if (enableCache && cache.has(cacheKey)) {
      charSimilarity = cache.get(cacheKey) ?? 0
    } else {
      charSimilarity = calculateCharSimilarityOptimized(
        normalizedFieldValue,
        normalizedSearchTerm
      )
      if (enableCache) {
        cache.set(cacheKey, charSimilarity)
      }
    }

    const charScore = charSimilarity * weightConfig.charSimilarity
    maxScore = Math.max(maxScore, charScore)

    // 6. 连续字符匹配（新增）- 优先匹配连续的字符序列
    const continuousMatchScore = calculateContinuousMatch(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    if (continuousMatchScore > 0) {
      maxScore = Math.max(
        maxScore,
        continuousMatchScore * weightConfig.charSimilarity * 1.2
      )
    }

    // 7. 中文词组匹配（新增）- 专门处理中文词组
    const chineseWordMatchScore = calculateChineseWordMatch(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    if (chineseWordMatchScore > 0) {
      maxScore = Math.max(
        maxScore,
        chineseWordMatchScore * weightConfig.charSimilarity * 1.5
      )
    }

    // 8. 长度相似度计算
    const lengthSimilarity = calculateLengthSimilarity(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    const lengthScore = lengthSimilarity * weightConfig.lengthSimilarity
    maxScore = Math.max(maxScore, lengthScore)

    // 7. 编辑距离计算（条件优化）
    let editScore = 0
    let editDistance = 0
    let maxLength = 0
    if (maxScore < minScore) {
      // 只有当前分数不够高时才计算编辑距离
      editDistance = calculateEditDistanceOptimized(
        normalizedFieldValue,
        normalizedSearchTerm,
        maxEditDistance
      )
      if (editDistance <= maxEditDistance) {
        maxLength = Math.max(
          normalizedFieldValue.length,
          normalizedSearchTerm.length
        )
        const editSimilarity =
          maxLength > 0 ? (maxLength - editDistance) / maxLength : 0
        editScore = editSimilarity * weightConfig.charSimilarity * 0.5
        maxScore = Math.max(maxScore, editScore)
      }
    }

    return {
      item,
      score: maxScore,
      details: {
        exactMatch: normalizedFieldValue === normalizedSearchTerm,
        prefixMatch:
          normalizedFieldValue.startsWith(normalizedSearchTerm) ||
          normalizedSearchTerm.startsWith(normalizedFieldValue),
        containsMatch:
          normalizedFieldValue.includes(normalizedSearchTerm) ||
          normalizedSearchTerm.includes(normalizedFieldValue),
        charSimilarity,
        lengthSimilarity,
        editSimilarity:
          editScore > 0 ? (maxLength - editDistance) / maxLength : 0
      }
    }
  })

  // 过滤掉分数太低的项目
  const filteredItems = scoredItems.filter((item) => item.score >= minScore)

  // 按分数降序排序
  filteredItems.sort((a, b) => b.score - a.score)

  // 返回分数最高的项目
  return filteredItems.length > 0 ? filteredItems[0].item : null
}

// ==================== 辅助函数 ====================

/**
 * 优化的字符相似度计算
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @returns 相似度分数 (0-1)
 */
function calculateCharSimilarityOptimized(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  if (str1 === str2) return 1

  const chars1 = new Set(str1)
  const chars2 = new Set(str2)

  let intersection = 0
  for (const char of chars1) {
    if (chars2.has(char)) {
      intersection++
    }
  }

  const union = chars1.size + chars2.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * 计算子串匹配分数
 * @param target - 目标字符串
 * @param search - 搜索字符串
 * @returns 匹配分数 (0-1)
 */
function calculateSubstringMatch(target: string, search: string): number {
  if (!target || !search) return 0

  // 检查搜索词是否是目标词的子串
  if (target.includes(search)) {
    return search.length / target.length
  }

  // 检查目标词是否是搜索词的子串
  if (search.includes(target)) {
    return target.length / search.length
  }

  return 0
}

/**
 * 计算共同前缀分数
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @returns 匹配分数 (0-1)
 */
function calculateCommonPrefix(str1: string, str2: string): number {
  if (!str1 || !str2) return 0

  let commonLength = 0
  const minLength = Math.min(str1.length, str2.length)

  for (let i = 0; i < minLength; i++) {
    if (str1[i] === str2[i]) {
      commonLength++
    } else {
      break
    }
  }

  if (commonLength === 0) return 0

  // 计算共同前缀的权重，考虑共同前缀长度和总长度
  const maxLength = Math.max(str1.length, str2.length)
  return commonLength / maxLength
}

/**
 * 计算连续字符匹配分数
 * @param target - 目标字符串
 * @param search - 搜索字符串
 * @returns 匹配分数 (0-1)
 */
function calculateContinuousMatch(target: string, search: string): number {
  if (!target || !search) return 0

  let maxContinuousLength = 0
  let currentContinuousLength = 0

  // 在目标字符串中查找搜索字符串的连续字符
  for (let i = 0; i <= target.length - search.length; i++) {
    currentContinuousLength = 0
    for (let j = 0; j < search.length; j++) {
      if (target[i + j] === search[j]) {
        currentContinuousLength++
      } else {
        break
      }
    }
    maxContinuousLength = Math.max(maxContinuousLength, currentContinuousLength)
  }

  if (maxContinuousLength === 0) return 0

  // 计算连续匹配的权重，连续字符越多权重越高
  const continuousRatio = maxContinuousLength / search.length
  const lengthRatio =
    maxContinuousLength / Math.max(target.length, search.length)

  return continuousRatio * 0.7 + lengthRatio * 0.3
}

/**
 * 计算中文词组匹配分数
 * @param target - 目标字符串
 * @param search - 搜索字符串
 * @returns 匹配分数 (0-1)
 */
function calculateChineseWordMatch(target: string, search: string): number {
  if (!target || !search) return 0

  // 将字符串按字符分割，模拟中文词组
  const targetChars = target.split('')
  const searchChars = search.split('')

  let matchCount = 0
  const totalSearchChars = searchChars.length

  // 计算搜索词中每个字符在目标词中的匹配情况
  for (const searchChar of searchChars) {
    if (targetChars.includes(searchChar)) {
      matchCount++
    }
  }

  if (matchCount === 0) return 0

  // 计算匹配率
  const matchRatio = matchCount / totalSearchChars

  // 考虑字符顺序的重要性
  let orderBonus = 0
  let consecutiveMatches = 0

  for (let i = 0; i < searchChars.length; i++) {
    const searchChar = searchChars[i]
    const targetIndex = targetChars.indexOf(searchChar)

    if (targetIndex !== -1) {
      // 检查是否在相近位置
      if (i === 0 || targetIndex > targetChars.indexOf(searchChars[i - 1])) {
        consecutiveMatches++
      }
    }
  }

  orderBonus = consecutiveMatches / totalSearchChars

  // 综合评分：匹配率 + 顺序奖励
  return matchRatio * 0.8 + orderBonus * 0.2
}

/**
 * 计算字符相似度
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @returns 相似度分数 (0-1)
 */
function calculateCharSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0

  const chars1 = new Set(str1.split(''))
  const chars2 = new Set(str2.split(''))

  const intersection = new Set([...chars1].filter((x) => chars2.has(x)))
  const union = new Set([...chars1, ...chars2])

  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * 计算长度相似度
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @returns 相似度分数 (0-1)
 */
function calculateLengthSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0

  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0 && len2 === 0) return 1
  if (len1 === 0 || len2 === 0) return 0

  const maxLen = Math.max(len1, len2)
  const minLen = Math.min(len1, len2)

  return minLen / maxLen
}

/**
 * 优化的编辑距离计算（带提前退出）
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @param maxDistance - 最大允许的编辑距离
 * @returns 编辑距离
 */
function calculateEditDistanceOptimized(str1: string, str2: string, maxDistance: number = 10): number {
  const len1 = str1.length
  const len2 = str2.length

  // 快速检查：如果长度差异超过最大距离，直接返回
  if (Math.abs(len1 - len2) > maxDistance) {
    return maxDistance + 1
  }

  // 使用滚动数组优化空间复杂度
  let prev = new Array(len2 + 1)
  let curr = new Array(len2 + 1)

  // 初始化第一行
  for (let j = 0; j <= len2; j++) {
    prev[j] = j
  }

  for (let i = 1; i <= len1; i++) {
    curr[0] = i

    for (let j = 1; j <= len2; j++) {
      if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
        curr[j] = prev[j - 1]
      } else {
        curr[j] = Math.min(
          prev[j - 1] + 1, // 替换
          curr[j - 1] + 1, // 插入
          prev[j] + 1 // 删除
        )
      }
    }

    // 提前退出检查
    const minInRow = Math.min(...curr)
    if (minInRow > maxDistance) {
      return maxDistance + 1
    }

    // 交换数组
    ;[prev, curr] = [curr, prev]
  }

  return prev[len2]
}

/**
 * 计算编辑距离（Levenshtein距离）
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @returns 编辑距离
 */
function calculateEditDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1, // 插入
          matrix[i - 1][j] + 1 // 删除
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * 高级模糊搜索方法（返回所有匹配结果）
 * @param list - 要搜索的数组
 * @param field - 要搜索的字段名
 * @param searchTerm - 搜索关键词
 * @param options - 配置选项
 * @returns 返回按匹配度排序的结果数组
 */
export function smartFuzzySearchAll<T extends SearchableItem>(
  list: T[],
  field: keyof T,
  searchTerm: string,
  options: Omit<SearchOptions, 'enableCache' | 'maxEditDistance'> = {}
): T[] {
  if (!list || !Array.isArray(list) || !field || !searchTerm) {
    return []
  }

  const {
    minScore = 0.3,
    caseSensitive = false,
    weightConfig: userWeightConfig = {}
  } = options

  const weightConfig = { ...DEFAULT_WEIGHT_CONFIG, ...userWeightConfig }

  const normalizedSearchTerm = caseSensitive
    ? searchTerm
    : searchTerm.toLowerCase()
  const searchWords = normalizedSearchTerm
    .split(/[\s,，。.]+/)
    .filter((word) => word.length > 0)

  const scoredItems = list.map((item): SearchResult<T> => {
    const fieldValue = item[field]
    if (!fieldValue) return {
      item,
      score: 0,
      details: {
        exactMatch: false,
        prefixMatch: false,
        containsMatch: false,
        charSimilarity: 0,
        lengthSimilarity: 0,
        editSimilarity: 0,
        wordMatches: 0
      }
    }

    const fieldValueStr = String(fieldValue)
    const normalizedFieldValue = caseSensitive
      ? fieldValueStr
      : fieldValueStr.toLowerCase()
    const fieldWords = normalizedFieldValue
      .split(/[\s,，。.]+/)
      .filter((word) => word.length > 0)

    let totalScore = 0
    let maxScore = 0

    // 完全匹配
    if (normalizedFieldValue === normalizedSearchTerm) {
      totalScore += weightConfig.exactMatch
      maxScore = Math.max(maxScore, weightConfig.exactMatch)
    }

    // 前缀匹配
    if (
      normalizedFieldValue.startsWith(normalizedSearchTerm) ||
      normalizedSearchTerm.startsWith(normalizedFieldValue)
    ) {
      totalScore += weightConfig.prefixMatch
      maxScore = Math.max(maxScore, weightConfig.prefixMatch)
    }

    // 包含匹配
    if (
      normalizedFieldValue.includes(normalizedSearchTerm) ||
      normalizedSearchTerm.includes(normalizedFieldValue)
    ) {
      totalScore += weightConfig.containsMatch
      maxScore = Math.max(maxScore, weightConfig.containsMatch)
    }

    // 词边界匹配
    const searchWordMatches = searchWords.filter((searchWord) =>
      fieldWords.some(
        (fieldWord) =>
          fieldWord.includes(searchWord) || searchWord.includes(fieldWord)
      )
    ).length

    if (searchWordMatches > 0) {
      const wordMatchScore =
        (searchWordMatches / searchWords.length) * weightConfig.wordBoundary
      totalScore += wordMatchScore
      maxScore = Math.max(maxScore, wordMatchScore)
    }

    // 字符相似度
    const charSimilarity = calculateCharSimilarity(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    const charScore = charSimilarity * weightConfig.charSimilarity
    totalScore += charScore
    maxScore = Math.max(maxScore, charScore)

    // 长度相似度
    const lengthSimilarity = calculateLengthSimilarity(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    const lengthScore = lengthSimilarity * weightConfig.lengthSimilarity
    totalScore += lengthScore
    maxScore = Math.max(maxScore, lengthScore)

    // 编辑距离
    const editDistance = calculateEditDistance(
      normalizedFieldValue,
      normalizedSearchTerm
    )
    const maxLength = Math.max(
      normalizedFieldValue.length,
      normalizedSearchTerm.length
    )
    const editSimilarity =
      maxLength > 0 ? (maxLength - editDistance) / maxLength : 0
    const editScore = editSimilarity * weightConfig.charSimilarity * 0.5
    totalScore += editScore
    maxScore = Math.max(maxScore, editScore)

    return {
      item,
      score: maxScore,
      details: {
        exactMatch: normalizedFieldValue === normalizedSearchTerm,
        prefixMatch:
          normalizedFieldValue.startsWith(normalizedSearchTerm) ||
          normalizedSearchTerm.startsWith(normalizedFieldValue),
        containsMatch:
          normalizedFieldValue.includes(normalizedSearchTerm) ||
          normalizedSearchTerm.includes(normalizedFieldValue),
        wordMatches: searchWordMatches,
        charSimilarity,
        lengthSimilarity,
        editSimilarity
      }
    }
  })

  // 过滤并排序
  return scoredItems
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.item)
}
