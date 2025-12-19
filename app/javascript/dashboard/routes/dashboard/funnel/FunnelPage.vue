<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import Button from 'dashboard/components-next/button/Button.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';
import ConversationApi from 'dashboard/api/inbox/conversation';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const state = reactive({
  loading: false,
  error: '',
  conversations: [],
});

const draggingId = ref(null);
const draggingOverColumn = ref(null);
const showComposeConversation = ref(false);
const columnTitles = reactive({
  pending: t('KANBAN.COLUMNS.PENDING'),
  open: t('KANBAN.COLUMNS.OPEN'),
  waiting: t('KANBAN.COLUMNS.WAITING'),
  resolved: t('KANBAN.COLUMNS.RESOLVED'),
});

// Mapeamento: 'waiting' no frontend mapeia para 'snoozed' no backend
const statusMapping = {
  pending: 'pending',
  open: 'open',
  waiting: 'snoozed', // Mapeia waiting para snoozed
  resolved: 'resolved',
};

const reverseStatusMapping = {
  pending: 'pending',
  open: 'open',
  snoozed: 'waiting', // Mapeia snoozed de volta para waiting
  resolved: 'resolved',
};

const columns = [
  { key: 'pending', color: 'bg-amber-100 text-amber-900 border-amber-200' },
  { key: 'open', color: 'bg-sky-100 text-sky-900 border-sky-200' },
  { key: 'waiting', color: 'bg-indigo-100 text-indigo-900 border-indigo-200' },
  {
    key: 'resolved',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
];

const fetchConversations = async () => {
  state.loading = true;
  state.error = '';
  try {
    // Busca conversas de cada status em paralelo, incluindo 'snoozed'
    const statuses = ['pending', 'open', 'snoozed', 'resolved'];
    const requests = statuses.map(status =>
      ConversationApi.get({
        status,
        page: 1,
        assigneeType: 'all',
        sortBy: 'last_activity_at',
      }).catch(() => {
        return { data: { payload: [] } };
      })
    );

    const responses = await Promise.all(requests);
    const allConversations = responses.flatMap(
      ({ data }) => data?.data?.payload || data?.payload || []
    );

    // Mapear status do backend para o frontend (snoozed -> waiting)
    state.conversations = allConversations.map(conversation => ({
      ...conversation,
      status: reverseStatusMapping[conversation.status] || conversation.status,
    }));
  } catch {
    state.error = t('KANBAN.ERROR_LOAD');
  } finally {
    state.loading = false;
  }
};

const updateStatus = async (conversationId, targetStatus) => {
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const previousStatus = conversation.status;
  const backendStatus = statusMapping[targetStatus] || targetStatus;

  // Atualização otimista
  const optimisticUpdate = () => {
    state.conversations = state.conversations.map(conv =>
      conv.id === conversationId
        ? {
            ...conv,
            status: reverseStatusMapping[backendStatus] || backendStatus,
          }
        : conv
    );
  };

  optimisticUpdate();

  try {
    await ConversationApi.toggleStatus({
      conversationId,
      status: backendStatus,
    });
    // Limpar erro se sucesso
    state.error = '';
  } catch {
    // Rollback em caso de erro
    state.conversations = state.conversations.map(conv =>
      conv.id === conversationId ? { ...conv, status: previousStatus } : conv
    );
    state.error = t('KANBAN.ERROR_UPDATE');
  }
};

const cardsByStatus = computed(() => {
  return status => {
    // Se for 'waiting', filtra por 'snoozed' também
    if (status === 'waiting') {
      return state.conversations.filter(
        conversation =>
          conversation.status === 'waiting' || conversation.status === 'snoozed'
      );
    }
    return state.conversations.filter(
      conversation => conversation.status === status
    );
  };
});

const onDragStart = (event, conversationId) => {
  draggingId.value = conversationId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.dropEffect = 'move';
  // Adiciona classe ao elemento sendo arrastado
  event.target.style.opacity = '0.5';
};

const onDragEnd = event => {
  event.target.style.opacity = '1';
  draggingId.value = null;
  draggingOverColumn.value = null;
};

const onDragOver = (event, status) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  draggingOverColumn.value = status;
};

const onDragLeave = () => {
  draggingOverColumn.value = null;
};

const onDrop = (event, status) => {
  event.preventDefault();
  event.stopPropagation();

  if (!draggingId.value) return;

  const id = draggingId.value;
  draggingId.value = null;
  draggingOverColumn.value = null;

  updateStatus(id, status);
};

const renameColumn = (key, event) => {
  columnTitles[key] = event.target.value;
};

const lastMessageContent = conversation => {
  const messages = conversation.messages || [];
  if (!messages.length) return '';
  const lastMessage = messages[messages.length - 1];
  return lastMessage?.content || '';
};

const openConversation = conversationId => {
  router.push({
    name: 'inbox_conversation',
    params: {
      accountId: route.params.accountId,
      id: conversationId,
    },
  });
};

onMounted(fetchConversations);
</script>

<template>
  <section class="flex flex-col gap-4 h-full overflow-hidden p-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-n-strong">
          {{ t('KANBAN.TITLE') }}
        </h1>
        <p class="text-sm text-n-slate-11">
          {{ t('KANBAN.SUBTITLE') }}
        </p>
      </div>
      <div class="flex gap-2">
        <ComposeConversation @close="showComposeConversation = false">
          <template #trigger="{ toggle }">
            <Button
              size="md"
              color="slate"
              icon="i-lucide-plus"
              @click="toggle"
            >
              {{ t('KANBAN.CREATE_CONVERSATION') }}
            </Button>
          </template>
        </ComposeConversation>
        <Button
          size="md"
          color="slate"
          icon="i-lucide-refresh-cw"
          :loading="state.loading"
          @click="fetchConversations"
        >
          {{ t('KANBAN.REFRESH') }}
        </Button>
      </div>
    </header>

    <div
      v-if="state.error"
      class="rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm"
    >
      {{ state.error }}
    </div>

    <div v-if="state.loading" class="flex flex-1 items-center justify-center">
      <Spinner size="lg" />
    </div>

    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 overflow-auto"
    >
      <div
        v-for="column in columns"
        :key="column.key"
        class="flex flex-col gap-3 rounded-lg border border-n-weak bg-n-solid-1 p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <input
            :value="columnTitles[column.key]"
            class="flex-1 rounded-md border border-n-weak bg-white px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-n-strong/20"
            @input="renameColumn(column.key, $event)"
          />
          <span
            class="px-2 py-1 text-xs rounded-md border"
            :class="column.color"
          >
            {{ cardsByStatus(column.key).length }}
          </span>
        </div>

        <div
          class="flex flex-col gap-2 min-h-[200px] rounded-md bg-n-solid-2 p-2 border border-dashed transition-colors"
          :class="
            draggingOverColumn === column.key
              ? 'border-n-strong bg-n-solid-3'
              : 'border-n-weak'
          "
          @dragover="onDragOver($event, column.key)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, column.key)"
        >
          <article
            v-for="conversation in cardsByStatus(column.key)"
            :key="conversation.id"
            class="rounded-md border border-n-weak bg-white p-3 shadow-sm cursor-move transition-transform hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            draggable="true"
            @dragstart="onDragStart($event, conversation.id)"
            @dragend="onDragEnd"
            @click="openConversation(conversation.id)"
          >
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-n-strong truncate">
                <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
                #{{ conversation.display_id || conversation.id }}
              </h3>
              <span class="text-[11px] text-n-slate-11 whitespace-nowrap">
                {{ conversation.meta?.sender?.name || t('KANBAN.NO_NAME') }}
              </span>
            </div>
            <p class="text-xs text-n-slate-11 line-clamp-2 mt-1">
              {{ lastMessageContent(conversation) || t('KANBAN.NO_MESSAGE') }}
            </p>
          </article>

          <p
            v-if="!cardsByStatus(column.key).length"
            class="text-xs text-n-slate-11 text-center py-4"
          >
            {{ t('KANBAN.EMPTY_COLUMN') }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
