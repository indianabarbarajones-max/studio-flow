import type { StudioState, Student } from '../shared/types.ts';

export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function seedState(): Omit<StudioState, 'aiConfigured'> {
  const today = localToday();
  const month = today.slice(0, 7);
  const names = ['Ana Martins', 'Beatriz Costa', 'Camila Santos', 'Daniela Lima', 'Eduardo Alves', 'Fernanda Rocha', 'Gabriel Souza', 'Helena Oliveira'];
  const students: Student[] = names.map((name, index) => ({
    id: `student-${index + 1}`, name, email: `aluno${index + 1}@example.com`, phone: '',
    plan: index === 7 ? 'Aula experimental' : index % 3 === 0 ? 'Ilimitado' : '2 aulas por semana',
    monthlyFee: index === 7 ? 0 : index % 3 === 0 ? 320 : 240,
    status: index === 7 ? 'trial' : 'active', renewalDate: offsetDate(today, index + 2),
  }));
  return {
    demo: true,
    settings: { studioName: 'Studio Aurora', ownerName: 'Marina', monthlyRevenueTarget: 5000 },
    students,
    transactions: [
      ...students.slice(0, 7).map((student, index) => ({ id: `transaction-${index + 1}`, description: `Mensalidade · ${student.name}`, category: 'Mensalidades', type: 'income' as const, amount: student.monthlyFee, dueDate: index < 5 ? `${month}-05` : offsetDate(today, index === 5 ? -3 : 3), status: index < 5 ? 'paid' as const : 'pending' as const, studentId: student.id })),
      { id: 'transaction-8', description: 'Aluguel do espaço', category: 'Estrutura', type: 'expense', amount: 850, dueDate: `${month}-05`, status: 'paid' },
      { id: 'transaction-9', description: 'Materiais de limpeza', category: 'Operação', type: 'expense', amount: 120, dueDate: `${month}-10`, status: 'paid' },
      { id: 'transaction-10', description: 'Internet e ferramentas', category: 'Operação', type: 'expense', amount: 99, dueDate: offsetDate(today, 5), status: 'pending' },
    ],
    classes: [
      { id: 'class-1', title: 'Hatha Yoga', date: today, startTime: '07:00', duration: 60, capacity: 10, instructor: 'Marina', studentIds: students.slice(0, 6).map(s => s.id) },
      { id: 'class-2', title: 'Vinyasa Flow', date: today, startTime: '18:30', duration: 60, capacity: 10, instructor: 'Marina', studentIds: students.slice(2, 7).map(s => s.id) },
      { id: 'class-3', title: 'Yoga para iniciantes', date: offsetDate(today, 1), startTime: '09:00', duration: 60, capacity: 8, instructor: 'Marina', studentIds: ['student-1', 'student-5', 'student-8'] },
      { id: 'class-4', title: 'Hatha Yoga', date: offsetDate(today, 2), startTime: '07:00', duration: 60, capacity: 10, instructor: 'Marina', studentIds: ['student-2', 'student-3', 'student-4'] },
      { id: 'class-5', title: 'Vinyasa Flow', date: offsetDate(today, 3), startTime: '18:30', duration: 60, capacity: 10, instructor: 'Marina', studentIds: ['student-1', 'student-2', 'student-6', 'student-7'] },
    ],
    tasks: [
      { id: 'task-1', title: 'Conferir recebimentos e mensalidades', area: 'Financeiro', dueDate: today, done: false },
      { id: 'task-2', title: 'Acolher a nova aluna da aula experimental', area: 'Alunos', dueDate: today, done: false },
      { id: 'task-3', title: 'Preparar conteúdo da semana', area: 'Marketing', dueDate: today, done: false },
      { id: 'task-4', title: 'Organizar a sala e os materiais', area: 'Operação', dueDate: today, done: true },
      { id: 'task-5', title: 'Revisar indicadores e definir uma ação de crescimento', area: 'Gestão', dueDate: offsetDate(today, 4), done: false },
    ],
    content: [
      { id: 'content-1', title: 'Uma pausa que transforma o dia', channel: 'Instagram', objective: 'Atrair novos alunos', scheduledDate: offsetDate(today, 1), status: 'draft', body: 'Entre uma tarefa e outra, há espaço para respirar. Reserve alguns minutos para perceber seu corpo e desacelerar. Quer experimentar uma prática acolhedora? Conheça nossas aulas e encontre seu ritmo. 🌿' },
      { id: 'content-2', title: 'Convite para a aula experimental', channel: 'WhatsApp', objective: 'Converter interessados', scheduledDate: offsetDate(today, 2), status: 'idea', body: '' },
      { id: 'content-3', title: 'Bastidores: nosso espaço de prática', channel: 'Instagram', objective: 'Fortalecer a conexão', scheduledDate: offsetDate(today, 3), status: 'scheduled', body: 'Cada detalhe é um convite à presença. Conheça o espaço em que compartilhamos movimento, respiração e cuidado. Qual é o seu momento favorito da prática?' },
    ],
    goals: [
      { id: 'goal-1', title: 'Ampliar a comunidade de alunos ativos', current: 7, target: 15, unit: 'alunos', deadline: offsetDate(today, 60) },
      { id: 'goal-2', title: 'Realizar aulas experimentais', current: 3, target: 10, unit: 'aulas', deadline: offsetDate(today, 30) },
      { id: 'goal-3', title: 'Manter consistência nas redes', current: 5, target: 12, unit: 'publicações', deadline: offsetDate(today, 30) },
    ],
  };
}
