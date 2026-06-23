// User types
export type UserRole = 'CLIENT' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Client Profile types
export type ResidencyStatus = 'CITIZEN' | 'PERMANENT_RESIDENT' | 'TEMPORARY_VISA';
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DE_FACTO' | 'DIVORCED' | 'WIDOWED';
export type EmploymentStatus = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'SELF_EMPLOYED' | 'UNEMPLOYED' | 'RETIRED';
export type Frequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'ANNUAL';
export type IncomeOwner = 'SELF' | 'PARTNER';
export type IncomeType = 'SALARY' | 'BONUS' | 'COMMISSION' | 'RENTAL' | 'INVESTMENT' | 'GOVERNMENT' | 'OTHER';
export type DebtType = 'HOME_LOAN' | 'PERSONAL_LOAN' | 'CAR_LOAN' | 'CREDIT_CARD' | 'HECS' | 'OTHER';
export type PropertyType = 'OWNER_OCCUPIED' | 'INVESTMENT' | 'RENTAL';
export type LoanPurpose = 'PURCHASE' | 'REFINANCE' | 'INVESTMENT' | 'CONSTRUCTION' | 'EQUITY_RELEASE';
export type RepaymentType = 'PI' | 'IO';
export type ClientStatus = 'Prospect' | 'Active' | 'Inactive';

export interface ClientProfile {
  id: string;
  userId: string;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  residencyStatus: ResidencyStatus;
  numberOfAdultDependants: number;
  numberOfChildDependants: number;
  privateSchoolingFlag: boolean;
  maritalStatus: MaritalStatus;
  employmentStatus: EmploymentStatus;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeSource {
  id: string;
  clientProfileId: string;
  owner: IncomeOwner;
  type: IncomeType;
  amount: number;
  frequency: Frequency;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExistingDebt {
  id: string;
  clientProfileId: string;
  type: DebtType;
  outstandingBalance: number;
  monthlyRepayment: number | null;
  interestRate: number | null;
  creditLimit: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  clientProfileId: string;
  type: PropertyType;
  address: string;
  estimatedValue: number;
  mortgageBalance: number | null;
  rentalIncome: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummary {
  id: string;
  clientProfileId: string;
  groceries: number;
  groceriesFreq: Frequency;
  utilities: number;
  utilitiesFreq: Frequency;
  transport: number;
  transportFreq: Frequency;
  insurance: number;
  insuranceFreq: Frequency;
  education: number;
  educationFreq: Frequency;
  childcare: number;
  childcareFreq: Frequency;
  entertainment: number;
  entertainmentFreq: Frequency;
  otherExpenses: number;
  otherExpensesFreq: Frequency;
  createdAt: string;
  updatedAt: string;
}

// Loan Scenario types
export interface LoanScenario {
  id: string;
  userId: string;
  purpose: LoanPurpose;
  repaymentType: RepaymentType;
  loanTermYears: number;
  interestRate: number;
  maxBorrowingCapacity: number | null;
  serviceabilityMax: number | null;
  dtiMax: number | null;
  monthlyRepayment: number | null;
  totalMonthlyIncome: number | null;
  totalMonthlyExpenses: number | null;
  netMonthlySurplus: number | null;
  dtiRatio: number | null;
  passesServiceability: boolean | null;
  passesDti: boolean | null;
  messages: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanScenarioInput {
  purpose: LoanPurpose;
  repaymentType: RepaymentType;
  loanTermYears: number;
  interestRate: number;
}

// Note types
export type NoteVisibility = 'ADMIN_ONLY' | 'CLIENT_VISIBLE';

export interface Note {
  id: string;
  userId: string;
  content: string;
  visibility: NoteVisibility;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

// Admin types
export interface AdminClientListItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  clientProfile: {
    status: ClientStatus;
  } | null;
  loanScenarios: LoanScenario[];
}

export interface AdminClientDetail {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  clientProfile: ClientProfile & {
    incomeSources: IncomeSource[];
    existingDebts: ExistingDebt[];
    properties: Property[];
    expenseSummary: ExpenseSummary | null;
  } | null;
  loanScenarios: LoanScenario[];
  notes: Note[];
}

// Form input types for creating/updating
export interface IncomeSourceInput {
  owner: IncomeOwner;
  type: IncomeType;
  amount: number;
  frequency: Frequency;
  description?: string;
}

export interface ExistingDebtInput {
  type: DebtType;
  outstandingBalance: number;
  monthlyRepayment?: number | null;
  interestRate?: number | null;
  creditLimit?: number | null;
  description?: string;
}

export interface PropertyInput {
  type: PropertyType;
  address: string;
  estimatedValue: number;
  mortgageBalance?: number | null;
  rentalIncome?: number | null;
  description?: string;
}

export interface ExpenseSummaryInput {
  groceries: number;
  groceriesFreq: Frequency;
  utilities: number;
  utilitiesFreq: Frequency;
  transport: number;
  transportFreq: Frequency;
  insurance: number;
  insuranceFreq: Frequency;
  education: number;
  educationFreq: Frequency;
  childcare: number;
  childcareFreq: Frequency;
  entertainment: number;
  entertainmentFreq: Frequency;
  otherExpenses: number;
  otherExpensesFreq: Frequency;
}

export interface ClientProfileInput {
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  residencyStatus: ResidencyStatus;
  numberOfAdultDependants: number;
  numberOfChildDependants: number;
  privateSchoolingFlag: boolean;
  maritalStatus: MaritalStatus;
  employmentStatus: EmploymentStatus;
}
