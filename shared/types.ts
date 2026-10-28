export interface Student { id: string; name: string; email: string; phone: string; plan: string; monthlyFee: number; status: 'active' | 'trial' | 'paused'; renewalDate: string }
export interface Transaction { id: string; description: string; category: string; type: 'income' | 'expense'; amount: number; dueDate: string; status: 'paid' | 'pending'; studentId?: string }
export interface YogaClass { id: string; title: string; date: string; startTime: string; duration: number; capacity: number; instructor: string; studentIds: string[]; syncToGoogle?: boolean; googleSyncStatus?: 'off' | 'pending' | 'synced' | 'error'; googleSyncError?: string }
export interface Task { id: string; title: string; area: string; dueDate: string; done: boolean }
export interface ContentItem { id: string; title: string; channel: 'Instagram' | 'WhatsApp'; objective: string; scheduledDate: string; status: 'idea' | 'draft' | 'scheduled' | 'published'; body: string }
export interface Goal { id: string; title: string; current: number; target: number; unit: string; deadline: string }
export interface Settings { studioName: string; ownerName: string; monthlyRevenueTarget: number; phone?: string; email?: string; address?: string; instagram?: string; website?: string; description?: string; audience?: string; tone?: string; services?: string; studioMemory?: string }
export interface StudioState { students: Student[]; transactions: Transaction[]; classes: YogaClass[]; tasks: Task[]; content: ContentItem[]; goals: Goal[]; settings: Settings; demo: boolean; aiConfigured: boolean; storage?: 'browser' | 'memory' }
export type Collection = 'students' | 'transactions' | 'classes' | 'tasks' | 'content' | 'goals';
export type Entity = Student | Transaction | YogaClass | Task | ContentItem | Goal;
export type View = 'overview' | 'students' | 'schedule' | 'finance' | 'routine' | 'content' | 'growth' | 'assistant' | 'settings';
export interface AssistantResponse { reply: string; mode: 'local' | 'ai' }
export interface ViewProps { state: StudioState; mutate: (collection: Collection, data: Record<string, unknown>, id?: string) => Promise<void>; remove: (collection: Collection, id: string) => Promise<void>; notify: (message: string) => void; refresh?: () => Promise<void> }

export interface IntegrationStatus { ai: { configured: boolean; model: string }; google: { configured: boolean; connected: boolean; calendarId: string; missing: string[] } }
