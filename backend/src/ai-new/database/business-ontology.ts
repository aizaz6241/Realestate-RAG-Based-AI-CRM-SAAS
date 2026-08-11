export const BusinessOntology: Record<string, string[]> = {
  transactions: ['SubscriptionPayment', 'Payroll'],
  payments: ['SubscriptionPayment'],
  salaries: ['Payroll'],
  users: ['User', 'EmployeeProfile'],
  employees: ['EmployeeProfile', 'User'],
  properties: ['Property', 'PropertyUnit'],
  sales: ['Lead', 'Transaction'],
  clients: ['User'],
  customers: ['User']
};
