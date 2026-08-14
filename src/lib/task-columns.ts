export const TASK_COLUMNS = [
  { status: "TODO", label: "Yapılacak", param: "todoPage" },
  { status: "IN_PROGRESS", label: "Devam ediyor", param: "progressPage" },
  { status: "DONE", label: "Tamamlandı", param: "donePage" },
] as const;
