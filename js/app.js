const SECTION_ORDER = Object.freeze([
  "업무 활용",
  "개인 투자용",
  "흥미·자기계발",
  "최근 AI 트렌드"
]);

/**
 * @typedef {"업무 활용" | "개인 투자용" | "흥미·자기계발" | "최근 AI 트렌드"} AllowedSection
 */

/**
 * 확인된 JSON 필드를 검증 전에 논리 이름으로 투영한 후보 모델이다.
 * unknown 값은 누락과 자료형 오류를 이후 검증 단계에서 구분하기 위해 그대로 유지한다.
 *
 * @typedef {Object} LogicalResourceCandidate
 * @property {number} sourceIndex
 * @property {unknown} section
 * @property {unknown} title
 * @property {unknown} description
 * @property {unknown} difficulty
 * @property {unknown} resourceType
 * @property {unknown} tags
 * @property {unknown} estimatedTime
 * @property {unknown} updatedDate
 * @property {unknown} externalUrl
 * @property {unknown} recommendation
 */

/**
 * @typedef {"recommended" | "general"} Recommendation
 */

/**
 * @typedef {Object} CalendarDate
 * @property {number} year
 * @property {number} month
 * @property {number} day
 */

/**
 * 모든 후속 검증을 통과한 뒤 렌더링 계층이 사용할 자료 모델이다.
 *
 * @typedef {Object} ValidResource
 * @property {number} sourceIndex
 * @property {AllowedSection} section
 * @property {string} title
 * @property {string} description
 * @property {string} difficulty
 * @property {string} resourceType
 * @property {readonly string[]} tags
 * @property {string} estimatedTime
 * @property {CalendarDate} updatedDate
 * @property {string} externalUrl
 * @property {Recommendation} recommendation
 */

/**
 * @typedef {{ sourceIndex: number, category: "NOT_OBJECT" }} ProjectionFailure
 */

/**
 * @typedef {
 *   | { ok: true, candidate: LogicalResourceCandidate }
 *   | { ok: false, failure: ProjectionFailure }
 * } CandidateProjection
 */

/**
 * @typedef {{ status: unknown, projection: CandidateProjection | null }} ResourceEntry
 */

const VALIDATION_ISSUE_CODES = Object.freeze({
  INVALID_SECTION: "INVALID_SECTION",
  INVALID_TITLE: "INVALID_TITLE",
  INVALID_DESCRIPTION: "INVALID_DESCRIPTION",
  INVALID_DIFFICULTY: "INVALID_DIFFICULTY",
  INVALID_RESOURCE_TYPE: "INVALID_RESOURCE_TYPE",
  INVALID_TAGS: "INVALID_TAGS",
  INVALID_ESTIMATED_TIME: "INVALID_ESTIMATED_TIME",
  INVALID_DATE: "INVALID_DATE",
  INVALID_URL: "INVALID_URL",
  INVALID_RECOMMENDATION: "INVALID_RECOMMENDATION"
});

function isResourceRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 공개 여부는 원값과 자료형을 그대로 검사한다. 공백 제거, 대소문자 변경,
 * 문자열 변환은 어떤 경우에도 수행하지 않는다.
 */
function isStrictlyPublished(value) {
  return typeof value === "string" && value === "published";
}

/**
 * 확인된 기존 JSON 계약과 논리 모델 사이의 유일한 필드 매핑 경계다.
 * 루트 배열과 원시 필드 값을 그대로 읽을 뿐 기본값, 별칭 또는 새 스키마를 만들지 않는다.
 */
const ResourceSchemaAdapter = Object.freeze({
  locateCollection(documentValue) {
    return Array.isArray(documentValue) ? documentValue : null;
  },

  readStatus(record) {
    return isResourceRecord(record) ? record.status : undefined;
  },

  projectPublishedCandidate(record, sourceIndex) {
    if (!isResourceRecord(record)) {
      return Object.freeze({
        ok: false,
        failure: Object.freeze({
          sourceIndex,
          category: "NOT_OBJECT"
        })
      });
    }

    return Object.freeze({
      ok: true,
      candidate: Object.freeze({
        sourceIndex,
        section: record.section,
        title: record.title,
        description: record.description,
        difficulty: record.level,
        resourceType: record.type,
        tags: record.tags,
        estimatedTime: record.duration,
        updatedDate: record.updatedAt,
        externalUrl: record.url,
        recommendation: record.recommended
      })
    });
  }
});

function adaptResourceDocument(documentValue) {
  const records = ResourceSchemaAdapter.locateCollection(documentValue);

  if (records === null) {
    return null;
  }

  return records.map((record, sourceIndex) => {
    const status = ResourceSchemaAdapter.readStatus(record);

    return Object.freeze({
      status,
      projection: isStrictlyPublished(status)
        ? ResourceSchemaAdapter.projectPublishedCandidate(record, sourceIndex)
        : null
    });
  });
}

function normalizeRequiredText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedTags = [];

  for (const tag of value) {
    const normalizedTag = normalizeRequiredText(tag);

    if (normalizedTag === null) {
      return null;
    }

    normalizedTags.push(normalizedTag);
  }

  return Object.freeze(normalizedTags);
}

function isValidCalendarDate(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const isLeapYear =
    year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  return day <= daysInMonth[month - 1];
}

/**
 * 확인된 YYYY-MM-DD 계약을 시간대 API 없이 달력 구성요소로 해석한다.
 */
function decodeCalendarDate(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  return Object.freeze({ year, month, day });
}

/**
 * Date나 Intl 변환을 거치지 않아 클라이언트 시간대와 무관하게 같은 연월일을 표시한다.
 */
function formatCalendarDate(calendarDate) {
  if (
    !isResourceRecord(calendarDate) ||
    !isValidCalendarDate(
      calendarDate.year,
      calendarDate.month,
      calendarDate.day
    )
  ) {
    return "-";
  }

  const year = String(calendarDate.year).padStart(4, "0");
  const month = String(calendarDate.month).padStart(2, "0");
  const day = String(calendarDate.day).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// 기존 호출 경계를 보존하면서 모든 표시를 CalendarDate 구성요소 기반으로 전환한다.
function formatDate(dateValue) {
  const calendarDate =
    typeof dateValue === "string" ? decodeCalendarDate(dateValue) : dateValue;

  return formatCalendarDate(calendarDate);
}

/**
 * base URL 없이 해석할 수 있고 protocol이 정확히 https:인 문자열만 돌려준다.
 */
function validateAbsoluteHttpsUrl(rawValue) {
  if (typeof rawValue !== "string" || typeof globalThis.URL !== "function") {
    return null;
  }

  try {
    const parsedUrl = new globalThis.URL(rawValue);
    return parsedUrl.protocol === "https:" ? rawValue : null;
  } catch {
    return null;
  }
}

function decodeRecommendation(rawValue) {
  if (rawValue === true) {
    return "recommended";
  }

  if (rawValue === false) {
    return "general";
  }

  return null;
}

/**
 * 공개 후보의 각 규칙을 독립적으로 검사하여 실패한 모든 규칙을 수집한다.
 */
function validatePublishedCandidate(candidate) {
  const candidateValue = isResourceRecord(candidate) ? candidate : {};
  const sourceIndex = Number.isInteger(candidateValue.sourceIndex)
    ? candidateValue.sourceIndex
    : -1;
  const issues = [];
  const addIssue = (code) => {
    issues.push(Object.freeze({ sourceIndex, code }));
  };

  const section = SECTION_ORDER.includes(candidateValue.section)
    ? candidateValue.section
    : null;

  if (section === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_SECTION);
  }

  const title = normalizeRequiredText(candidateValue.title);

  if (title === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_TITLE);
  }

  const description = normalizeRequiredText(candidateValue.description);

  if (description === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_DESCRIPTION);
  }

  const difficulty = normalizeRequiredText(candidateValue.difficulty);

  if (difficulty === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_DIFFICULTY);
  }

  const resourceType = normalizeRequiredText(candidateValue.resourceType);

  if (resourceType === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_RESOURCE_TYPE);
  }

  const tags = normalizeTags(candidateValue.tags);

  if (tags === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_TAGS);
  }

  const estimatedTime = normalizeRequiredText(candidateValue.estimatedTime);

  if (estimatedTime === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_ESTIMATED_TIME);
  }

  const updatedDate = decodeCalendarDate(candidateValue.updatedDate);

  if (updatedDate === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_DATE);
  }

  const externalUrl = validateAbsoluteHttpsUrl(candidateValue.externalUrl);

  if (externalUrl === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_URL);
  }

  const recommendation = decodeRecommendation(candidateValue.recommendation);

  if (recommendation === null) {
    addIssue(VALIDATION_ISSUE_CODES.INVALID_RECOMMENDATION);
  }

  if (issues.length > 0) {
    return Object.freeze({
      valid: false,
      issues: Object.freeze(issues)
    });
  }

  return Object.freeze({
    valid: true,
    resource: Object.freeze({
      sourceIndex,
      section,
      title,
      description,
      difficulty,
      resourceType,
      tags,
      estimatedTime,
      updatedDate,
      externalUrl,
      recommendation
    })
  });
}

/**
 * 비공개 항목은 후보에서 제외하고, 공개이지만 유효하지 않은 항목만 집계한다.
 * 유효한 자료는 입력 순서를 유지하며 한 항목의 오류가 다음 항목 검사를 중단하지 않는다.
 */
function validateResourceEntries(entries) {
  const validResources = [];
  const issues = [];
  const issueCountsByCode = new Map();
  let invalidPublishedCount = 0;

  for (const entry of entries) {
    if (!isStrictlyPublished(entry?.status)) {
      continue;
    }

    if (entry.projection?.ok !== true) {
      invalidPublishedCount += 1;
      continue;
    }

    const validationResult = validatePublishedCandidate(
      entry.projection.candidate
    );

    if (validationResult.valid) {
      validResources.push(validationResult.resource);
      continue;
    }

    invalidPublishedCount += 1;

    for (const issue of validationResult.issues) {
      issues.push(issue);
      issueCountsByCode.set(
        issue.code,
        (issueCountsByCode.get(issue.code) || 0) + 1
      );
    }
  }

  return Object.freeze({
    validResources: Object.freeze(validResources),
    invalidPublishedCount,
    issues: Object.freeze(issues),
    issueCountsByCode
  });
}

// 분야 옵션은 데이터에서 확장하지 않고 전체 값과 고정 네 섹션만 제공한다.
const SECTION_FILTER_OPTIONS = Object.freeze(["all", ...SECTION_ORDER]);

/**
 * @typedef {Object} QueryState
 * @property {string} searchText
 * @property {AllowedSection | null} section
 * @property {string | null} difficulty
 * @property {string | null} resourceType
 * @property {boolean} recommendedOnly
 */

/** @type {Readonly<QueryState>} */
const DEFAULT_QUERY_STATE = Object.freeze({
  searchText: "",
  section: null,
  difficulty: null,
  resourceType: null,
  recommendedOnly: false
});

const RECOMMENDATION_VALUES = Object.freeze({
  RECOMMENDED: "recommended",
  GENERAL: "general"
});

const RECOMMENDATION_LABELS = Object.freeze({
  [RECOMMENDATION_VALUES.RECOMMENDED]: "추천 자료",
  [RECOMMENDATION_VALUES.GENERAL]: "일반 자료"
});

const DASHBOARD_VIEW_MESSAGES = Object.freeze({
  LOADING: "자료를 불러오는 중입니다.",
  LOAD_ERROR: "자료를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
  INITIAL_EMPTY: "게시된 유효한 자료가 없습니다.",
  QUERY_EMPTY:
    "현재 검색 및 필터 조건과 일치하는 자료가 없습니다. 조건을 변경하거나 초기화해 주세요."
});

/**
 * 추천 필터와 카드 문구가 검증된 Recommendation 값을 같은 키로 사용하게 한다.
 */
function getRecommendationLabel(recommendation) {
  return Object.prototype.hasOwnProperty.call(
    RECOMMENDATION_LABELS,
    recommendation
  )
    ? RECOMMENDATION_LABELS[recommendation]
    : null;
}

/**
 * 화면에 영향을 주는 검색 또는 필터가 하나라도 활성화되었는지 판정한다.
 * DOM의 전체 선택값인 "all"과 내부 전체 선택값인 null은 모두 비활성이다.
 */
function hasActiveQueryCriteria(queryState = DEFAULT_QUERY_STATE) {
  const state = isResourceRecord(queryState)
    ? queryState
    : DEFAULT_QUERY_STATE;

  return (
    normalizeSearchQuery(state.searchText) !== "" ||
    !isUnconstrainedFilterValue(state.section) ||
    !isUnconstrainedFilterValue(state.difficulty) ||
    !isUnconstrainedFilterValue(state.resourceType) ||
    state.recommendedOnly === true
  );
}

/**
 * 로드 상태와 순수 쿼리 결과를 상호 배타적인 화면 상태로 투영한다.
 * 실패 범주나 원시 입력은 ViewModel 문구에 보간하지 않으며, ready 상태에서만
 * 카드 그룹과 부분 제외 안내를 제공한다.
 *
 * @param {{ phase?: string, resources?: readonly ValidResource[], invalidPublishedCount?: number }} loadState
 * @param {readonly ValidResource[] | undefined} validResources
 * @param {number | undefined} invalidPublishedCount
 * @param {QueryState | undefined} queryState
 */
function projectView(
  loadState,
  validResources,
  invalidPublishedCount,
  queryState = DEFAULT_QUERY_STATE
) {
  const phase = isResourceRecord(loadState) ? loadState.phase : loadState;

  if (phase === "load-error") {
    return Object.freeze({
      kind: "load-error",
      notice: DASHBOARD_VIEW_MESSAGES.LOAD_ERROR,
      canRetry: true
    });
  }

  if (phase !== "ready") {
    return Object.freeze({
      kind: "loading",
      notice: DASHBOARD_VIEW_MESSAGES.LOADING
    });
  }

  const resources = Array.isArray(validResources)
    ? validResources
    : Array.isArray(loadState.resources)
      ? loadState.resources
      : Object.freeze([]);
  const query = isResourceRecord(queryState)
    ? queryState
    : DEFAULT_QUERY_STATE;
  const hasActiveCriteria = hasActiveQueryCriteria(query);
  const visibleResources = selectVisibleResources(resources, query);
  const visibleCount = visibleResources.length;
  const excludedCountCandidate = Number.isSafeInteger(invalidPublishedCount)
    ? invalidPublishedCount
    : loadState.invalidPublishedCount;
  const excludedCount =
    Number.isSafeInteger(excludedCountCandidate) && excludedCountCandidate > 0
      ? excludedCountCandidate
      : 0;
  const partialInvalidNotice =
    excludedCount > 0
      ? `일부 자료 ${excludedCount}개를 표시할 수 없어 제외했습니다.`
      : null;

  let kind;
  let notice;

  if (visibleCount > 0) {
    kind = "populated";
    notice = `총 ${visibleCount}개의 자료를 표시합니다.`;
  } else if (hasActiveCriteria) {
    kind = "query-empty";
    notice = DASHBOARD_VIEW_MESSAGES.QUERY_EMPTY;
  } else {
    kind = "initial-empty";
    notice = DASHBOARD_VIEW_MESSAGES.INITIAL_EMPTY;
  }

  return Object.freeze({
    kind,
    notice,
    partialInvalidNotice,
    groups: groupByFixedSection(visibleResources),
    visibleCount,
    hasActiveCriteria,
    canReset: hasActiveCriteria
  });
}

/**
 * 검색 비교용 값만 정규화하며 입력 문자열 자체는 변경하지 않는다.
 */
function normalizeSearchQuery(query) {
  return typeof query === "string" ? query.trim().toLowerCase() : "";
}

/**
 * 제목, 설명, 섹션, 난이도, 자료 유형 및 각 태그 중 하나라도 검색어를
 * 포함하는지 OR 의미론으로 판정한다. 표시용 원값은 변경하지 않는다.
 */
function matchesSearch(resource, query) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery === "") {
    return true;
  }

  const searchTargets = [
    resource.title,
    resource.description,
    resource.section,
    resource.difficulty,
    resource.resourceType,
    ...resource.tags
  ];

  return searchTargets.some((target) =>
    target.toLowerCase().includes(normalizedQuery)
  );
}

function isUnconstrainedFilterValue(value) {
  return value === null || value === undefined || value === "all";
}

/**
 * 전체/null 차원은 제한하지 않고 활성 필터만 AND로 결합한다.
 */
function matchesFilters(resource, filterState = DEFAULT_QUERY_STATE) {
  const isSectionMatched =
    isUnconstrainedFilterValue(filterState.section) ||
    resource.section === filterState.section;
  const isDifficultyMatched =
    isUnconstrainedFilterValue(filterState.difficulty) ||
    resource.difficulty === filterState.difficulty;
  const isResourceTypeMatched =
    isUnconstrainedFilterValue(filterState.resourceType) ||
    resource.resourceType === filterState.resourceType;
  const isRecommendationMatched =
    filterState.recommendedOnly !== true ||
    resource.recommendation === RECOMMENDATION_VALUES.RECOMMENDED;

  return (
    isSectionMatched &&
    isDifficultyMatched &&
    isResourceTypeMatched &&
    isRecommendationMatched
  );
}

/**
 * 검색과 모든 활성 필터를 AND로 계산한다. Array#filter를 한 번만 사용하여
 * 입력 순서를 유지하고 여러 검색 대상에 일치하는 자료도 한 번만 포함한다.
 */
function selectVisibleResources(resources, queryState = DEFAULT_QUERY_STATE) {
  return Object.freeze(
    resources.filter(
      (resource) =>
        matchesSearch(resource, queryState.searchText) &&
        matchesFilters(resource, queryState)
    )
  );
}

/**
 * 기존 상태를 변경하지 않고 완전한 기본 QueryState를 반환한다.
 */
function resetQueryState() {
  return DEFAULT_QUERY_STATE;
}

/**
 * 선택 결과를 고정 네 섹션에 입력 순서대로 한 번씩 배치한다.
 * 유효 모델 밖의 섹션 값은 새 그룹을 만들지 않는다.
 */
function groupByFixedSection(resources) {
  const groups = new Map(
    SECTION_ORDER.map((sectionName) => [sectionName, []])
  );

  for (const resource of resources) {
    const sectionResources = groups.get(resource.section);

    if (sectionResources !== undefined) {
      sectionResources.push(resource);
    }
  }

  for (const sectionName of SECTION_ORDER) {
    groups.set(sectionName, Object.freeze(groups.get(sectionName)));
  }

  return Object.freeze(groups);
}

/**
 * 유효한 공개 자료의 표시값을 그대로 사용해 동적 필터 옵션을 만든다.
 * Set과 새 배열만 사용하므로 입력 자료와 각 자료 객체를 변경하지 않는다.
 */
function deriveFilterOptions(resources) {
  const difficulties = [];
  const resourceTypes = [];
  const seenDifficulties = new Set();
  const seenResourceTypes = new Set();

  for (const resource of resources) {
    if (!seenDifficulties.has(resource.difficulty)) {
      seenDifficulties.add(resource.difficulty);
      difficulties.push(resource.difficulty);
    }

    if (!seenResourceTypes.has(resource.resourceType)) {
      seenResourceTypes.add(resource.resourceType);
      resourceTypes.push(resource.resourceType);
    }
  }

  return Object.freeze({
    difficulties: Object.freeze(difficulties),
    resourceTypes: Object.freeze(resourceTypes)
  });
}

const dashboardContent = document.getElementById("dashboardContent");
const searchInput = document.getElementById("searchInput");
const sectionFilter = document.getElementById("sectionFilter");
const levelFilter = document.getElementById("levelFilter");
const typeFilter = document.getElementById("typeFilter");
const recommendedOnly = document.getElementById("recommendedOnly");
const resourceCount = document.getElementById("resourceCount");
const lastUpdated = document.getElementById("lastUpdated");

const DASHBOARD_DOM_REFS = Object.freeze({
  dashboardContent,
  searchInput,
  sectionFilter,
  levelFilter,
  typeFilter,
  recommendedOnly,
  resourceCount,
  lastUpdated,
  loadAlert: document.getElementById("loadAlert"),
  resetButton: document.getElementById("resetFilters"),
  reloadButton: document.getElementById("reloadResources")
});

const EMPTY_FILTER_OPTIONS = Object.freeze({
  difficulties: Object.freeze([]),
  resourceTypes: Object.freeze([])
});
const DEFAULT_RESOURCE_URL = "data/resources.json";

function escapeHtml(value) {
  const text = String(value ?? "");

  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeFilterSelection(value) {
  return value === null || value === undefined || value === "all"
    ? null
    : value;
}

function createQueryState(queryState = DEFAULT_QUERY_STATE) {
  const state = isResourceRecord(queryState)
    ? queryState
    : DEFAULT_QUERY_STATE;

  return Object.freeze({
    searchText: typeof state.searchText === "string" ? state.searchText : "",
    section: normalizeFilterSelection(state.section),
    difficulty: normalizeFilterSelection(state.difficulty),
    resourceType: normalizeFilterSelection(state.resourceType),
    recommendedOnly: state.recommendedOnly === true
  });
}

function readCurrentQueryState(domRefs = DASHBOARD_DOM_REFS) {
  return createQueryState({
    searchText: domRefs.searchInput?.value ?? "",
    section: domRefs.sectionFilter?.value ?? null,
    difficulty: domRefs.levelFilter?.value ?? null,
    resourceType: domRefs.typeFilter?.value ?? null,
    recommendedOnly: domRefs.recommendedOnly?.checked === true
  });
}

function writeQueryStateToControls(domRefs, queryState) {
  const query = createQueryState(queryState);

  if (domRefs.searchInput) {
    domRefs.searchInput.value = query.searchText;
  }

  if (domRefs.sectionFilter) {
    domRefs.sectionFilter.value = query.section ?? "all";
  }

  if (domRefs.levelFilter) {
    domRefs.levelFilter.value = query.difficulty ?? "all";
  }

  if (domRefs.typeFilter) {
    domRefs.typeFilter.value = query.resourceType ?? "all";
  }

  if (domRefs.recommendedOnly) {
    domRefs.recommendedOnly.checked = query.recommendedOnly;
  }
}

function reconcileQueryWithFilterOptions(queryState, filterOptions) {
  const query = createQueryState(queryState);
  const difficulties = new Set(filterOptions.difficulties);
  const resourceTypes = new Set(filterOptions.resourceTypes);

  return createQueryState({
    ...query,
    section:
      query.section === null || SECTION_ORDER.includes(query.section)
        ? query.section
        : null,
    difficulty:
      query.difficulty === null || difficulties.has(query.difficulty)
        ? query.difficulty
        : null,
    resourceType:
      query.resourceType === null || resourceTypes.has(query.resourceType)
        ? query.resourceType
        : null
  });
}

function createTextElement(documentRef, tagName, text, className = "") {
  const element = documentRef.createElement(tagName);

  if (className !== "") {
    element.className = className;
  }

  element.textContent = text;
  return element;
}

const SECTION_HEADING_IDS = Object.freeze({
  "업무 활용": "workSectionHeading",
  "개인 투자용": "investmentSectionHeading",
  "흥미·자기계발": "growthSectionHeading",
  "최근 AI 트렌드": "trendSectionHeading"
});

/**
 * 검증된 자료 한 건을 DOM API만 사용해 접근 가능한 article로 만든다.
 * JSON 유래 문자열은 textContent로 삽입하며 링크는 HTTPS 재검증 후에만 생성한다.
 */
function createResourceCard(resource, documentRef = globalThis.document) {
  const article = documentRef.createElement("article");
  const titleId = `resource-title-${resource.sourceIndex}`;
  const title = createTextElement(
    documentRef,
    "h3",
    resource.title
  );

  article.className = "resource-card";
  article.setAttribute("aria-labelledby", titleId);
  title.id = titleId;
  article.append(title);
  article.append(
    createTextElement(
      documentRef,
      "p",
      resource.description,
      "resource-description"
    )
  );

  const metadata = documentRef.createElement("div");
  metadata.className = "card-meta";

  // 기존의 짧은 추천 배지를 유지하되, 아래에 두 상태의 명시적 문구도 제공한다.
  if (resource.recommendation === RECOMMENDATION_VALUES.RECOMMENDED) {
    const badge = createTextElement(
      documentRef,
      "span",
      "추천",
      "tag recommended-badge"
    );
    badge.setAttribute("aria-hidden", "true");
    metadata.append(badge);
  }

  metadata.append(
    createTextElement(
      documentRef,
      "span",
      `난이도: ${resource.difficulty}`,
      "tag difficulty-tag"
    )
  );
  metadata.append(
    createTextElement(
      documentRef,
      "span",
      `자료 유형: ${resource.resourceType}`,
      "tag resource-type-tag"
    )
  );

  if (resource.tags.length === 0) {
    metadata.append(
      createTextElement(
        documentRef,
        "span",
        "태그 없음",
        "tag resource-tag no-tags"
      )
    );
  } else {
    for (const tag of resource.tags) {
      metadata.append(
        createTextElement(
          documentRef,
          "span",
          `태그: ${tag}`,
          "tag resource-tag"
        )
      );
    }
  }

  const recommendationLabel = getRecommendationLabel(
    resource.recommendation
  );
  metadata.append(
    createTextElement(
      documentRef,
      "span",
      recommendationLabel === null
        ? "추천 여부: 확인 불가"
        : `추천 여부: ${recommendationLabel}`,
      "recommendation-status"
    )
  );
  article.append(metadata);

  const footer = documentRef.createElement("div");
  footer.className = "card-footer";
  const details = documentRef.createElement("div");
  details.className = "card-details";
  details.append(
    createTextElement(
      documentRef,
      "span",
      `예상 소요 시간: ${resource.estimatedTime}`,
      "estimated-time"
    )
  );

  const dateRow = documentRef.createElement("span");
  dateRow.className = "updated-date";
  dateRow.append(documentRef.createTextNode("업데이트: "));
  const formattedDate = formatCalendarDate(resource.updatedDate);

  if (formattedDate === "-") {
    dateRow.append(documentRef.createTextNode("확인 불가"));
  } else {
    const time = createTextElement(
      documentRef,
      "time",
      formattedDate
    );
    time.setAttribute("datetime", formattedDate);
    dateRow.append(time);
  }

  details.append(dateRow);
  footer.append(details);

  const validatedUrl = validateAbsoluteHttpsUrl(resource.externalUrl);

  if (validatedUrl === null) {
    footer.append(
      createTextElement(
        documentRef,
        "span",
        "외부 링크를 사용할 수 없습니다.",
        "resource-link-unavailable"
      )
    );
  } else {
    const link = createTextElement(
      documentRef,
      "a",
      `${resource.title} 외부 자료 새 창에서 열기`,
      "resource-link"
    );
    link.setAttribute("href", validatedUrl);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    footer.append(link);
  }

  article.append(footer);
  return article;
}

/**
 * 허용된 고정 섹션만 만들고 해당 섹션의 자료만 한 번씩 배치한다.
 */
function createResourceSection(
  sectionName,
  resources,
  documentRef = globalThis.document
) {
  if (!SECTION_ORDER.includes(sectionName) || !Array.isArray(resources)) {
    return null;
  }

  const matchingResources = resources.filter(
    (resource) => resource?.section === sectionName
  );

  if (matchingResources.length === 0) {
    return null;
  }

  const section = documentRef.createElement("section");
  const headingId = SECTION_HEADING_IDS[sectionName];
  section.className = "content-section";
  section.setAttribute("aria-labelledby", headingId);

  const headingContainer = documentRef.createElement("div");
  headingContainer.className = "section-heading";
  const heading = createTextElement(
    documentRef,
    "h2",
    sectionName
  );
  heading.id = headingId;
  headingContainer.append(heading);
  headingContainer.append(
    createTextElement(
      documentRef,
      "span",
      `${matchingResources.length}개`,
      "section-count"
    )
  );
  section.append(headingContainer);

  const grid = documentRef.createElement("div");
  grid.className = "resource-grid";

  for (const resource of matchingResources) {
    grid.append(createResourceCard(resource, documentRef));
  }

  section.append(grid);
  return section;
}

function compareCalendarDates(firstDate, secondDate) {
  return (
    firstDate.year - secondDate.year ||
    firstDate.month - secondDate.month ||
    firstDate.day - secondDate.day
  );
}

function getLatestUpdatedDate(resources) {
  let latestDate = null;

  for (const resource of resources) {
    if (
      latestDate === null ||
      compareCalendarDates(resource.updatedDate, latestDate) > 0
    ) {
      latestDate = resource.updatedDate;
    }
  }

  return latestDate;
}

/**
 * Controller 상태를 DOM과 무관한 결과 렌더 모델로 투영한다.
 * 컨트롤 참조는 모델에 포함하지 않으므로 결과 렌더러가 컨트롤 노드를
 * 교체하거나 초점을 이동할 필요가 없다.
 */
function createDashboardRenderModel(
  dashboardState,
  viewProjector = projectView
) {
  const loadState = isResourceRecord(dashboardState?.load)
    ? dashboardState.load
    : Object.freeze({ phase: "loading", generation: 0 });
  const queryState = isResourceRecord(dashboardState?.query)
    ? dashboardState.query
    : DEFAULT_QUERY_STATE;
  const filterOptions = isResourceRecord(dashboardState?.filterOptions)
    ? dashboardState.filterOptions
    : EMPTY_FILTER_OPTIONS;
  const readyResources =
    loadState.phase === "ready" && Array.isArray(loadState.resources)
      ? loadState.resources
      : Object.freeze([]);
  const invalidCount =
    loadState.phase === "ready" ? loadState.invalidPublishedCount : 0;

  return Object.freeze({
    generation: Number.isSafeInteger(loadState.generation)
      ? loadState.generation
      : 0,
    query: queryState,
    filterOptions,
    view: viewProjector(
      loadState,
      readyResources,
      invalidCount,
      queryState
    ),
    latestUpdatedDate: getLatestUpdatedDate(readyResources)
  });
}

/**
 * 현재 마크업의 결과 노드만 갱신한다. 검색 및 필터 컨트롤은 이 함수의
 * 쓰기 대상이 아니며 결과 변경 중 focus()도 호출하지 않는다.
 * 각 상태의 결과 하위 트리는 완성된 DocumentFragment로 한 번에 교체한다.
 */
function renderDashboard(renderModel, domRefs = DASHBOARD_DOM_REFS) {
  const view = renderModel.view;
  const resultContent = domRefs.dashboardContent;
  const loadAlert =
    domRefs.loadAlert ||
    resultContent?.ownerDocument?.getElementById("loadAlert") ||
    null;

  if (view.kind === "load-error") {
    // 같은 실패를 polite status와 alert가 동시에 알리지 않게 한다.
    if (domRefs.resourceCount) {
      domRefs.resourceCount.textContent = "";
    }

    if (loadAlert) {
      loadAlert.textContent = view.notice;
    }

    if (domRefs.lastUpdated) {
      domRefs.lastUpdated.textContent = "";
    }

    if (resultContent) {
      const documentRef = resultContent.ownerDocument;
      const errorMessage = createTextElement(
        documentRef,
        "p",
        `${view.notice} '자료 다시 불러오기' 버튼으로 다시 시도해 주세요.`,
        "error-message"
      );
      resultContent.replaceChildren(errorMessage);
    }

    return;
  }

  // 정상 status를 사용하기 전 이전 오류 alert를 먼저 비운다.
  if (loadAlert) {
    loadAlert.textContent = "";
  }

  if (view.kind === "loading") {
    if (domRefs.resourceCount) {
      domRefs.resourceCount.textContent = view.notice;
    }

    if (domRefs.lastUpdated) {
      domRefs.lastUpdated.textContent = "";
    }

    if (resultContent) {
      const loadingMessage = createTextElement(
        resultContent.ownerDocument,
        "p",
        view.notice,
        "loading-message"
      );
      resultContent.replaceChildren(loadingMessage);
    }

    return;
  }

  const statusMessages = [view.notice];

  if (view.partialInvalidNotice) {
    statusMessages.push(view.partialInvalidNotice);
  }

  if (domRefs.resourceCount) {
    domRefs.resourceCount.textContent = statusMessages.join(" ");
  }

  if (domRefs.lastUpdated) {
    domRefs.lastUpdated.textContent = renderModel.latestUpdatedDate
      ? `최근 업데이트: ${formatCalendarDate(renderModel.latestUpdatedDate)}`
      : "";
  }

  if (!resultContent) {
    return;
  }

  const documentRef = resultContent.ownerDocument;
  const resultFragment = documentRef.createDocumentFragment();

  if (view.partialInvalidNotice) {
    resultFragment.append(
      createTextElement(
        documentRef,
        "p",
        view.partialInvalidNotice,
        "partial-invalid-message"
      )
    );
  }

  if (view.kind === "initial-empty" || view.kind === "query-empty") {
    resultFragment.append(
      createTextElement(
        documentRef,
        "p",
        view.notice,
        `empty-message ${view.kind}`
      )
    );
    resultContent.replaceChildren(resultFragment);
    return;
  }

  for (const sectionName of SECTION_ORDER) {
    const resourcesInSection = view.groups.get(sectionName);
    const section = createResourceSection(
      sectionName,
      resourcesInSection,
      documentRef
    );

    if (section !== null) {
      resultFragment.append(section);
    }
  }

  resultContent.replaceChildren(resultFragment);
}

function syncSelectOptions(
  selectElement,
  values,
  allOptionLabel,
  selectedValue
) {
  if (!selectElement) {
    return;
  }

  const desiredValues = ["all", ...values];
  const currentValues = selectElement.options
    ? Array.from(selectElement.options, (option) => option.value)
    : [];
  const optionsAlreadyMatch =
    currentValues.length === desiredValues.length &&
    currentValues.every((value, index) => value === desiredValues[index]);
  const ownerDocument = selectElement.ownerDocument;

  if (
    !optionsAlreadyMatch &&
    ownerDocument &&
    typeof ownerDocument.createElement === "function" &&
    typeof selectElement.replaceChildren === "function"
  ) {
    const optionElements = desiredValues.map((value, index) => {
      const option = ownerDocument.createElement("option");
      option.value = value;
      option.textContent = index === 0 ? allOptionLabel : value;
      return option;
    });

    selectElement.replaceChildren(...optionElements);
  }

  const nextValue = selectedValue ?? "all";
  selectElement.value = nextValue;

  if (selectElement.value !== nextValue) {
    selectElement.value = "all";
  }
}

/**
 * select 자체는 유지하고 성공한 검증 결과의 option 자식만 동기화한다.
 */
function syncDynamicFilterOptions(
  domRefs,
  filterOptions,
  queryState
) {
  syncSelectOptions(
    domRefs.levelFilter,
    filterOptions.difficulties,
    "전체 난이도",
    queryState.difficulty
  );
  syncSelectOptions(
    domRefs.typeFilter,
    filterOptions.resourceTypes,
    "전체 유형",
    queryState.resourceType
  );
}

const LOAD_FAILURE_CATEGORIES = Object.freeze({
  REQUEST_FAILED: "REQUEST_FAILED",
  HTTP_FAILED: "HTTP_FAILED",
  BODY_READ_FAILED: "BODY_READ_FAILED",
  JSON_PARSE_FAILED: "JSON_PARSE_FAILED",
  COLLECTION_NOT_FOUND: "COLLECTION_NOT_FOUND"
});

function createLoadFailure(category) {
  return Object.freeze({ ok: false, category });
}

/**
 * 정적 JSON 문서를 읽기 전용 GET 요청으로 불러온다.
 * 각 실패 단계는 예외나 원시 응답 내용을 노출하지 않는 내부 범주로 반환한다.
 *
 * @param {string} resourceUrl
 * @param {AbortSignal | undefined} requestSignal
 * @param {typeof fetch} fetchImplementation
 * @returns {Promise<
 *   | { ok: true, document: unknown }
 *   | { ok: false, category: string }
 * >}
 */
async function loadResourceDocument(
  resourceUrl,
  requestSignal,
  fetchImplementation = fetch
) {
  const requestOptions = { method: "GET" };

  if (requestSignal !== undefined) {
    requestOptions.signal = requestSignal;
  }

  let response;

  try {
    response = await fetchImplementation(resourceUrl, requestOptions);
  } catch {
    return createLoadFailure(LOAD_FAILURE_CATEGORIES.REQUEST_FAILED);
  }

  if (!response || response.ok !== true) {
    return createLoadFailure(LOAD_FAILURE_CATEGORIES.HTTP_FAILED);
  }

  let responseText;

  try {
    responseText = await response.text();
  } catch {
    return createLoadFailure(LOAD_FAILURE_CATEGORIES.BODY_READ_FAILED);
  }

  let documentValue;

  try {
    documentValue = JSON.parse(responseText);
  } catch {
    return createLoadFailure(LOAD_FAILURE_CATEGORIES.JSON_PARSE_FAILED);
  }

  if (ResourceSchemaAdapter.locateCollection(documentValue) === null) {
    return createLoadFailure(LOAD_FAILURE_CATEGORIES.COLLECTION_NOT_FOUND);
  }

  return Object.freeze({ ok: true, document: documentValue });
}

/**
 * Dashboard Controller는 DashboardState를 변경하는 유일한 경계다.
 * Repository, 검증, Query Engine과 결과 렌더러를 주입 가능하게 연결한다.
 */
function createDashboardController(domRefs, dependencies = {}) {
  const stableDomRefs = domRefs || DASHBOARD_DOM_REFS;
  const resourceUrl = dependencies.resourceUrl || DEFAULT_RESOURCE_URL;
  const repositoryLoad =
    dependencies.repository &&
    typeof dependencies.repository.load === "function"
      ? (url, signal) => dependencies.repository.load(url, signal)
      : typeof dependencies.loadResourceDocument === "function"
        ? dependencies.loadResourceDocument
        : loadResourceDocument;
  const adaptDocument =
    typeof dependencies.adaptResourceDocument === "function"
      ? dependencies.adaptResourceDocument
      : adaptResourceDocument;
  const validateEntries =
    typeof dependencies.validateResourceEntries === "function"
      ? dependencies.validateResourceEntries
      : validateResourceEntries;
  const deriveOptions =
    typeof dependencies.deriveFilterOptions === "function"
      ? dependencies.deriveFilterOptions
      : deriveFilterOptions;
  const viewProjector =
    typeof dependencies.projectView === "function"
      ? dependencies.projectView
      : projectView;
  const renderResults =
    typeof dependencies.render === "function"
      ? dependencies.render
      : renderDashboard;
  const synchronizeFilterOptions =
    typeof dependencies.syncFilterOptions === "function"
      ? dependencies.syncFilterOptions
      : syncDynamicFilterOptions;

  let dashboardState = Object.freeze({
    load: Object.freeze({ phase: "idle", generation: 0 }),
    query: readCurrentQueryState(stableDomRefs),
    filterOptions: EMPTY_FILTER_OPTIONS
  });
  let listenersBound = false;

  function getRenderModel() {
    return createDashboardRenderModel(dashboardState, viewProjector);
  }

  function commitState(nextState, refreshFilterOptions = false) {
    dashboardState = Object.freeze({
      load: nextState.load,
      query: nextState.query,
      filterOptions: nextState.filterOptions
    });

    if (refreshFilterOptions) {
      synchronizeFilterOptions(
        stableDomRefs,
        dashboardState.filterOptions,
        dashboardState.query
      );
    }

    const renderModel = getRenderModel();
    renderResults(renderModel, stableDomRefs);
    return renderModel;
  }

  function getState() {
    return dashboardState;
  }

  function applyQuery(nextQueryState) {
    return commitState({
      load: dashboardState.load,
      query: createQueryState(nextQueryState),
      filterOptions: dashboardState.filterOptions
    });
  }

  function resetQuery() {
    const resetState = resetQueryState();

    // 컨트롤 값을 먼저 한 번에 맞춘 뒤 단일 state commit과 단일 render를 수행한다.
    writeQueryStateToControls(stableDomRefs, resetState);

    return commitState({
      load: dashboardState.load,
      query: resetState,
      filterOptions: dashboardState.filterOptions
    });
  }

  async function reloadResources(requestSignal) {
    const currentGeneration = Number.isSafeInteger(
      dashboardState.load.generation
    )
      ? dashboardState.load.generation
      : 0;
    const generation = currentGeneration + 1;

    // loading 상태에는 이전 resources가 없으므로 재시도 중에도 이전 카드가 복원되지 않는다.
    commitState({
      load: Object.freeze({ phase: "loading", generation }),
      query: dashboardState.query,
      filterOptions: dashboardState.filterOptions
    });

    let loadResult;

    try {
      loadResult = await repositoryLoad(resourceUrl, requestSignal);
    } catch {
      loadResult = createLoadFailure(LOAD_FAILURE_CATEGORIES.REQUEST_FAILED);
    }

    if (dashboardState.load.generation !== generation) {
      return Object.freeze({ committed: false, stale: true });
    }

    if (!loadResult || loadResult.ok !== true) {
      const failureResult =
        loadResult && loadResult.ok === false
          ? loadResult
          : createLoadFailure(LOAD_FAILURE_CATEGORIES.REQUEST_FAILED);

      commitState({
        load: Object.freeze({
          phase: "load-error",
          generation,
          category: failureResult.category
        }),
        query: dashboardState.query,
        filterOptions: dashboardState.filterOptions
      });

      return Object.freeze({ committed: true, result: failureResult });
    }

    let adaptedResources;
    let validationBatch;

    try {
      adaptedResources = adaptDocument(loadResult.document);
      validationBatch =
        adaptedResources === null
          ? null
          : validateEntries(adaptedResources);
    } catch {
      validationBatch = null;
    }

    if (validationBatch === null) {
      const failureResult = createLoadFailure(
        LOAD_FAILURE_CATEGORIES.COLLECTION_NOT_FOUND
      );

      commitState({
        load: Object.freeze({
          phase: "load-error",
          generation,
          category: failureResult.category
        }),
        query: dashboardState.query,
        filterOptions: dashboardState.filterOptions
      });

      return Object.freeze({ committed: true, result: failureResult });
    }

    const filterOptions = deriveOptions(validationBatch.validResources);
    const query = reconcileQueryWithFilterOptions(
      dashboardState.query,
      filterOptions
    );
    const readyLoadState = Object.freeze({
      phase: "ready",
      generation,
      resources: validationBatch.validResources,
      invalidPublishedCount: validationBatch.invalidPublishedCount
    });

    // 전체 문서 검증, 옵션 파생, query 조정을 마친 최신 generation만 원자적으로 commit한다.
    commitState(
      {
        load: readyLoadState,
        query,
        filterOptions
      },
      true
    );

    return Object.freeze({ committed: true, result: loadResult });
  }

  function bindListener(element, eventName, listener) {
    if (element && typeof element.addEventListener === "function") {
      element.addEventListener(eventName, listener);
    }
  }

  function bindStableControls() {
    const applyCurrentControls = () => {
      applyQuery(readCurrentQueryState(stableDomRefs));
    };

    bindListener(stableDomRefs.searchInput, "input", applyCurrentControls);
    bindListener(stableDomRefs.sectionFilter, "change", applyCurrentControls);
    bindListener(stableDomRefs.levelFilter, "change", applyCurrentControls);
    bindListener(stableDomRefs.typeFilter, "change", applyCurrentControls);
    bindListener(
      stableDomRefs.recommendedOnly,
      "change",
      applyCurrentControls
    );
    bindListener(stableDomRefs.resetButton, "click", (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      resetQuery();
    });
    bindListener(stableDomRefs.reloadButton, "click", () => {
      void reloadResources();
    });
  }

  function initialize() {
    if (!listenersBound) {
      bindStableControls();
      listenersBound = true;
    }

    return reloadResources();
  }

  return Object.freeze({
    initialize,
    reloadResources,
    applyQuery,
    resetQuery,
    getState,
    getRenderModel
  });
}

const dashboardController = createDashboardController(DASHBOARD_DOM_REFS);

// 기존 호출 경계를 유지하면서 실제 상태 변경은 Controller에 위임한다.
function loadResources(requestSignal) {
  return dashboardController.reloadResources(requestSignal);
}

if (
  dashboardContent &&
  typeof document.createElement === "function"
) {
  void dashboardController.initialize();
}
