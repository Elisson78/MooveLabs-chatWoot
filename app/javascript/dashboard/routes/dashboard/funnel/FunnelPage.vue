<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { useStore, useStoreGetters } from 'dashboard/composables/store';
import Button from 'dashboard/components-next/button/Button.vue';
import Spinner from 'dashboard/components-next/spinner/Spinner.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import ColorPicker from 'dashboard/components-next/colorpicker/ColorPicker.vue';
import ConversationApi from 'dashboard/api/inbox/conversation';
import ConversationLabelsAPI from 'dashboard/api/conversations';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const store = useStore();
const getters = useStoreGetters();

// Cores padrão para as colunas
const defaultColors = [
  {
    bg: 'bg-amber-100',
    text: 'text-amber-900',
    border: 'border-amber-200',
    hex: '#fef3c7',
  },
  {
    bg: 'bg-sky-100',
    text: 'text-sky-900',
    border: 'border-sky-200',
    hex: '#e0f2fe',
  },
  {
    bg: 'bg-indigo-100',
    text: 'text-indigo-900',
    border: 'border-indigo-200',
    hex: '#e0e7ff',
  },
  {
    bg: 'bg-emerald-100',
    text: 'text-emerald-900',
    border: 'border-emerald-200',
    hex: '#d1fae5',
  },
  {
    bg: 'bg-rose-100',
    text: 'text-rose-900',
    border: 'border-rose-200',
    hex: '#ffe4e6',
  },
  {
    bg: 'bg-purple-100',
    text: 'text-purple-900',
    border: 'border-purple-200',
    hex: '#f3e8ff',
  },
  {
    bg: 'bg-orange-100',
    text: 'text-orange-900',
    border: 'border-orange-200',
    hex: '#ffedd5',
  },
  {
    bg: 'bg-teal-100',
    text: 'text-teal-900',
    border: 'border-teal-200',
    hex: '#ccfbf1',
  },
];

const state = reactive({
  loading: false,
  error: '',
  conversations: [],
});

const draggingId = ref(null);
const draggingOverColumn = ref(null);
const showComposeConversation = ref(false);
const columnSettingsDialogRef = ref(null);
const cardEditDialogRef = ref(null);
const editingCard = ref(null);

// Carregar configurações do localStorage
const loadColumnConfig = () => {
  const accountId = route?.params?.accountId;
  if (!accountId) return null;
  const saved = localStorage.getItem(`kanban-columns-${accountId}`);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  return null;
};

// Salvar configurações no localStorage
const saveColumnConfig = config => {
  const accountId = route?.params?.accountId;
  if (!accountId) return;
  localStorage.setItem(`kanban-columns-${accountId}`, JSON.stringify(config));
};

// Configuração inicial das colunas - usar valores padrão sem tradução inicialmente
const getDefaultColumns = () => [
  {
    key: 'pending',
    title: 'Nouveau lead',
    status: 'pending',
    colorIndex: 0,
  },
  {
    key: 'open',
    title: 'En cours',
    status: 'open',
    colorIndex: 1,
  },
  {
    key: 'waiting',
    title: 'En attente client',
    status: 'snoozed',
    colorIndex: 2,
  },
  {
    key: 'resolved',
    title: 'Fermé',
    status: 'resolved',
    colorIndex: 3,
  },
];

const savedConfig = loadColumnConfig();
const defaultColumns = getDefaultColumns();

// Inicializar colunas com valores padrão ou salvos
const columns = ref(
  savedConfig && savedConfig.length > 0 ? savedConfig : defaultColumns
);

// Atualizar títulos com traduções após montagem
const updateColumnTitles = () => {
  if (!savedConfig) {
    // Só atualiza se não houver configuração salva (usuário não renomeou)
    columns.value = columns.value.map(col => {
      const translations = {
        pending: t('KANBAN.COLUMNS.PENDING'),
        open: t('KANBAN.COLUMNS.OPEN'),
        waiting: t('KANBAN.COLUMNS.WAITING'),
        resolved: t('KANBAN.COLUMNS.RESOLVED'),
      };
      if (translations[col.key]) {
        return { ...col, title: translations[col.key] };
      }
      return col;
    });
  }
};

// Mapeamento: 'waiting' no frontend mapeia para 'snoozed' no backend
const statusMapping = {
  pending: 'pending',
  open: 'open',
  waiting: 'snoozed',
  resolved: 'resolved',
};

const reverseStatusMapping = {
  pending: 'pending',
  open: 'open',
  snoozed: 'waiting',
  resolved: 'resolved',
};

// Labels
const accountLabels = computed(() => getters['labels/getLabels'].value || []);
const conversationLabels = reactive({});

// Carregar labels das conversas
const loadConversationLabels = async () => {
  const conversationIds = state.conversations.map(c => c.id);
  const labelPromises = conversationIds.map(async id => {
    try {
      const response = await ConversationLabelsAPI.getLabels(id);
      conversationLabels[id] = response.data.payload || [];
    } catch {
      conversationLabels[id] = [];
    }
  });
  await Promise.all(labelPromises);
};

// Buscar conversas
const fetchConversations = async () => {
  state.loading = true;
  state.error = '';
  try {
    // Garantir que temos colunas válidas
    if (!columns.value || columns.value.length === 0) {
      columns.value = getDefaultColumns();
    }

    const statuses = columns.value.map(col => col.status).filter(Boolean);
    const uniqueStatuses = [...new Set(statuses)];

    if (uniqueStatuses.length === 0) {
      state.conversations = [];
      state.loading = false;
      return;
    }

    const requests = uniqueStatuses.map(status =>
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

    // Mapear status do backend para o frontend
    state.conversations = allConversations.map(conversation => {
      const frontendStatus =
        reverseStatusMapping[conversation.status] || conversation.status;
      const column = columns.value.find(
        col => col.status === conversation.status || col.key === frontendStatus
      );
      return {
        ...conversation,
        status: column?.key || frontendStatus,
      };
    });

    await loadConversationLabels();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Erro ao carregar conversas do kanban:', error);
    state.error = t('KANBAN.ERROR_LOAD');
    state.conversations = [];
  } finally {
    state.loading = false;
  }
};

// Atualizar status
const updateStatus = async (conversationId, targetStatus) => {
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (!conversation) return;

  const previousStatus = conversation.status;
  const targetColumn = columns.value.find(col => col.key === targetStatus);
  const backendStatus =
    targetColumn?.status || statusMapping[targetStatus] || targetStatus;

  // Atualização otimista
  state.conversations = state.conversations.map(conv =>
    conv.id === conversationId ? { ...conv, status: targetStatus } : conv
  );

  try {
    await ConversationApi.toggleStatus({
      conversationId,
      status: backendStatus,
    });
    state.error = '';
  } catch {
    state.conversations = state.conversations.map(conv =>
      conv.id === conversationId ? { ...conv, status: previousStatus } : conv
    );
    state.error = t('KANBAN.ERROR_UPDATE');
  }
};

// Cards por status
const cardsByStatus = computed(() => {
  return status => {
    return state.conversations.filter(
      conversation => conversation.status === status
    );
  };
});

// Drag and drop
const onDragStart = (event, conversationId) => {
  draggingId.value = conversationId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.dropEffect = 'move';
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

// Gerenciamento de colunas
const addColumn = () => {
  const newKey = `custom-${Date.now()}`;
  const newColumn = {
    key: newKey,
    title: t('KANBAN.NEW_COLUMN'),
    status: 'open',
    colorIndex: columns.value.length % defaultColors.length,
  };
  columns.value.push(newColumn);
  saveColumnConfig(columns.value);
};

const removeColumn = key => {
  if (columns.value.length <= 1) return;
  const index = columns.value.findIndex(col => col.key === key);
  if (index > -1) {
    columns.value.splice(index, 1);
    saveColumnConfig(columns.value);
    fetchConversations();
  }
};

const updateColumnTitle = (key, title) => {
  const column = columns.value.find(col => col.key === key);
  if (column) {
    column.title = title;
    saveColumnConfig(columns.value);
  }
};

const updateColumnColor = (key, colorIndex) => {
  const column = columns.value.find(col => col.key === key);
  if (column) {
    column.colorIndex = colorIndex;
    saveColumnConfig(columns.value);
  }
};

const getColumnColor = colorIndex => {
  const color = defaultColors[colorIndex % defaultColors.length];
  return `${color.bg} ${color.text} ${color.border}`;
};

const getCardColor = conversation => {
  return (
    conversation.cardColor || conversation.custom_attributes?.card_color || ''
  );
};

// Editar card
const editCard = conversation => {
  editingCard.value = { ...conversation };
  editingCard.value.cardColor = getCardColor(conversation);
  editingCard.value.selectedLabels = [
    ...(conversationLabels[conversation.id] || []),
  ];
};

const saveCard = async () => {
  if (!editingCard.value) return;

  // Salvar cor do card (pode ser salvo em customAttributes)
  if (editingCard.value.cardColor) {
    try {
      await ConversationApi.updateCustomAttributes({
        conversationId: editingCard.value.id,
        customAttributes: {
          ...editingCard.value.custom_attributes,
          card_color: editingCard.value.cardColor,
        },
      });
    } catch {
      // Ignorar erro
    }
  }

  // Salvar labels
  if (editingCard.value.selectedLabels) {
    try {
      await ConversationLabelsAPI.updateLabels(
        editingCard.value.id,
        editingCard.value.selectedLabels
      );
      conversationLabels[editingCard.value.id] =
        editingCard.value.selectedLabels;
    } catch {
      // Ignorar erro
    }
  }

  // Atualizar estado local
  state.conversations = state.conversations.map(conv =>
    conv.id === editingCard.value.id
      ? { ...conv, cardColor: editingCard.value.cardColor }
      : conv
  );

  cardEditDialogRef.value?.close();
  editingCard.value = null;
};

const getCardLabels = conversationId => {
  return conversationLabels[conversationId] || [];
};

const openConversation = (conversationId, event) => {
  if (event?.target?.closest('.card-actions')) return;
  router.push({
    name: 'inbox_conversation',
    params: {
      accountId: route.params.accountId,
      id: conversationId,
    },
  });
};

const lastMessageContent = conversation => {
  const messages = conversation.messages || [];
  if (!messages.length) return '';
  const lastMessage = messages[messages.length - 1];
  return lastMessage?.content || '';
};

// Carregar labels do account
onMounted(async () => {
  try {
    // Atualizar títulos das colunas com traduções
    updateColumnTitles();
    await store.dispatch('labels/get');
    await fetchConversations();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Erro ao inicializar kanban:', error);
    state.error = t('KANBAN.ERROR_LOAD');
    state.loading = false;
  }
});

// Salvar configurações quando colunas mudarem
watch(
  columns,
  () => {
    saveColumnConfig(columns.value);
  },
  { deep: true }
);
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
        <Button
          size="md"
          color="slate"
          icon="i-lucide-settings"
          @click="columnSettingsDialogRef?.open()"
        >
          {{ t('KANBAN.SETTINGS') }}
        </Button>
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
      class="flex gap-4 flex-1 overflow-x-auto overflow-y-hidden pb-4 kanban-scroll"
    >
      <div
        v-for="column in columns"
        :key="column.key"
        class="flex flex-col gap-3 rounded-lg border bg-n-solid-1 p-3 min-w-[280px] max-w-[280px] flex-shrink-0"
        :class="[
          getColumnColor(column.colorIndex),
          `border-${defaultColors[column.colorIndex % defaultColors.length].border.split('-')[2]}-200`,
        ]"
      >
        <div class="flex items-center justify-between gap-2">
          <input
            :value="column.title"
            class="flex-1 rounded-md border border-n-weak bg-white px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-n-strong/20"
            @input="updateColumnTitle(column.key, $event.target.value)"
          />
          <div class="flex items-center gap-1">
            <span
              class="px-2 py-1 text-xs rounded-md border font-semibold"
              :class="getColumnColor(column.colorIndex)"
            >
              {{ cardsByStatus(column.key).length }}
            </span>
            <Button
              v-if="columns.length > 1"
              size="xs"
              variant="ghost"
              color="slate"
              icon="i-lucide-x"
              @click="removeColumn(column.key)"
            />
          </div>
        </div>

        <div
          class="flex flex-col gap-2 min-h-[200px] rounded-md bg-white/50 dark:bg-black/20 p-2 border border-dashed transition-colors"
          :class="
            draggingOverColumn === column.key
              ? 'border-n-strong bg-white/70 dark:bg-black/30'
              : 'border-n-weak/50'
          "
          @dragover="onDragOver($event, column.key)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, column.key)"
        >
          <article
            v-for="conversation in cardsByStatus(column.key)"
            :key="conversation.id"
            class="rounded-lg border border-n-weak bg-white p-3 shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            :style="getCardBorderStyle(conversation)"
            draggable="true"
            @dragstart="onDragStart($event, conversation.id)"
            @dragend="onDragEnd"
            @click="openConversation(conversation.id, $event)"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <h3 class="text-sm font-semibold text-n-strong truncate flex-1">
                <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
                #{{ conversation.display_id || conversation.id }}
              </h3>
              <button
                class="card-actions opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-n-solid-2 rounded"
                @click.stop="
                  editCard(conversation);
                  cardEditDialogRef?.open();
                "
              >
                <i class="i-lucide-more-horizontal text-n-slate-11" />
              </button>
            </div>

            <!-- Labels -->
            <div
              v-if="getCardLabels(conversation.id).length"
              class="flex flex-wrap gap-1 mb-2"
            >
              <span
                v-for="labelTitle in getCardLabels(conversation.id)"
                :key="labelTitle"
                class="px-2 py-0.5 text-[10px] font-medium rounded-full"
                :style="getLabelStyle(labelTitle)"
              >
                {{ labelTitle }}
              </span>
            </div>

            <p class="text-xs text-n-slate-11 line-clamp-2">
              {{ conversation.meta?.sender?.name || t('KANBAN.NO_NAME') }}
            </p>
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

      <!-- Botão para adicionar coluna -->
      <div class="min-w-[280px] flex-shrink-0">
        <button
          class="w-full h-12 rounded-lg border-2 border-dashed border-n-weak bg-n-solid-1 text-n-slate-11 hover:border-n-strong hover:bg-n-solid-2 transition-colors flex items-center justify-center gap-2"
          @click="addColumn"
        >
          <i class="i-lucide-plus" />
          {{ t('KANBAN.ADD_COLUMN') }}
        </button>
      </div>
    </div>

    <!-- Dialog de configurações de colunas -->
    <Dialog
      ref="columnSettingsDialogRef"
      :title="t('KANBAN.COLUMN_SETTINGS')"
      :show-confirm-button="false"
      :show-cancel-button="false"
      @close="() => {}"
    >
      <div class="flex flex-col gap-4">
        <div
          v-for="column in columns"
          :key="column.key"
          class="flex items-center gap-3 p-3 border border-n-weak rounded-lg"
        >
          <input
            :value="column.title"
            class="flex-1 rounded-md border border-n-weak bg-white px-2 py-1 text-sm"
            @input="updateColumnTitle(column.key, $event.target.value)"
          />
          <div class="flex gap-2">
            <div
              v-for="(color, index) in defaultColors.slice(0, 8)"
              :key="index"
              class="w-8 h-8 rounded border-2 cursor-pointer transition-transform hover:scale-110"
              :class="
                column.colorIndex === index
                  ? 'border-n-strong scale-110'
                  : 'border-n-weak'
              "
              :style="{ backgroundColor: color.hex }"
              @click="updateColumnColor(column.key, index)"
            />
          </div>
          <Button
            v-if="columns.length > 1"
            size="xs"
            variant="ghost"
            color="ruby"
            icon="i-lucide-trash-2"
            @click="removeColumn(column.key)"
          />
        </div>
        <Button icon="i-lucide-plus" @click="addColumn">
          {{ t('KANBAN.ADD_COLUMN') }}
        </Button>
      </div>
    </Dialog>

    <!-- Dialog de edição de card -->
    <Dialog
      ref="cardEditDialogRef"
      :title="t('KANBAN.EDIT_CARD')"
      :show-confirm-button="false"
      :show-cancel-button="false"
      @close="editingCard = null"
    >
      <div v-if="editingCard" class="flex flex-col gap-4">
        <div>
          <label class="block text-sm font-medium text-n-slate-12 mb-2">
            {{ t('KANBAN.CARD_COLOR') }}
          </label>
          <ColorPicker v-model="editingCard.cardColor" />
        </div>

        <div>
          <label class="block text-sm font-medium text-n-slate-12 mb-2">
            {{ t('KANBAN.CARD_LABELS') }}
          </label>
          <div
            class="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-n-weak rounded"
          >
            <label
              v-for="label in accountLabels"
              :key="label.id"
              class="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="editingCard.selectedLabels?.includes(label.title)"
                @change="
                  e => {
                    if (!editingCard.selectedLabels)
                      editingCard.selectedLabels = [];
                    if (e.target.checked) {
                      if (!editingCard.selectedLabels.includes(label.title)) {
                        editingCard.selectedLabels.push(label.title);
                      }
                    } else {
                      editingCard.selectedLabels =
                        editingCard.selectedLabels.filter(
                          l => l !== label.title
                        );
                    }
                  }
                "
              />
              <span
                class="px-2 py-1 text-xs font-medium rounded-full text-white"
                :style="getLabelStyle(label.title)"
              >
                {{ label.title }}
              </span>
            </label>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <Button
            variant="faded"
            color="slate"
            label="Annuler"
            @click="cardEditDialogRef?.close()"
          />
          <Button color="blue" label="Enregistrer" @click="saveCard" />
        </div>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
article {
  position: relative;
}

article:hover .card-actions {
  opacity: 1;
}

.group:hover article .card-actions {
  opacity: 1;
}

.kanban-card {
  border-left: 4px solid transparent;
}

.kanban-card-colored {
  border-left-width: 4px;
}

.kanban-scroll {
  scrollbar-width: thin;
}
</style>
