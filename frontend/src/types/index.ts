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
export type Frequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
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
  // Extended Quickli-style fields
  postcode?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  transactionType?: 'OWNS_WITH_MORTGAGE' | 'OWNS_OUTRIGHT' | 'PURCHASING' | null;
  holidayFlag?: boolean;
  eligibleNegativeGearing?: boolean;
  rentalIncomeAmount?: number | null;
  rentalIncomeFrequency?: Frequency | null;
  investmentExpenseAmount?: number | null;
  investmentExpenseFrequency?: Frequency | null;
  valuationSource?: string | null;
  valuationDate?: string | null;
  ownership?: string | null;
  includeInServicing?: boolean;
  // Optional inline existing-loan fields (Property Portfolio table)
  existingHomeLoanId?: string | null;
  loanAmount?: number | null;
  remainingLoanAmount?: number | null;
  loanTermRemainingYears?: number | null;
  currentBank?: string | null;
  loanInterestRate?: number | null;
  loanMonthlyRepayment?: number | null;
  growth?: PropertyGrowth;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyGrowth {
  currentValue: number;
  purchasePrice: number | null;
  capitalGrowthDollars: number | null;
  capitalGrowthPercent: number | null;
  yearsHeld: number | null;
  cagrPercent: number | null;
  weeklyRent: number | null;
  totalGrossRent: number | null;
  grossYieldPercent: number | null;
}

export interface PortfolioGrowth {
  totalValue: number;
  totalDebt: number;
  totalEquity: number;
  totalPurchase: number;
  totalCapitalGrowthDollars: number | null;
  totalCapitalGrowthPercent: number | null;
  blendedGrossYieldPercent: number | null;
  propertyCount: number;
  disclaimer: string;
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
  // Expanded living-expense categories (A2). Amounts optional (nullable);
  // *Freq columns default MONTHLY.
  rental?: number | null;
  rentalFreq?: Frequency;
  schoolFees?: number | null;
  schoolFeesFreq?: Frequency;
  homeLoanRepayment?: number | null;
  homeLoanRepaymentFreq?: Frequency;
  creditCardRepayment?: number | null;
  creditCardRepaymentFreq?: Frequency;
  otherLoanRepayment?: number | null;
  otherLoanRepaymentFreq?: Frequency;
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
  tags: string | null;
  pinned: boolean;
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


// === Extended Quickli-style servicing entities ===

export type IncomeCategory =
  | 'BASE_SALARY_PAYG' | 'SECOND_PAYG' | 'CASUAL' | 'COMMISSION' | 'OVERTIME'
  | 'ESSENTIAL_OVERTIME' | 'ALLOWANCES' | 'BONUS_RECENT' | 'BONUS_PREVIOUS'
  | 'FOREIGN_PAYG' | 'NET_FOREIGN' | 'INVESTMENT' | 'INTEREST' | 'SUPER_ANNUITY'
  | 'CARERS' | 'GOVERNMENT_PENSION' | 'COMPANY_CAR' | 'CHILD_MAINTENANCE'
  | 'OTHER_TAXED' | 'OTHER_TAX_FREE' | 'FAMILY_TAX_A' | 'FAMILY_TAX_B'
  | 'PARENTING_PAYMENT' | 'PRETAX_DEDUCTION' | 'POSTTAX_DEDUCTION';

export type EmploymentType = 'FULL_TIME_PERMANENT' | 'PART_TIME' | 'CASUAL' | 'CONTRACT';

export interface IncomeEntry {
  id: string;
  clientProfileId: string;
  applicantId: string | null;
  owner?: IncomeOwner | null;
  category: IncomeCategory;
  amount: number;
  frequency: Frequency;
  shadingOverride: number | null;
  jobNumber: number | null;
  employer: string | null;
  employmentType: EmploymentType | null;
  industry: string | null;
  startDate: string | null;
  payDate: string | null;
  payslipEndDate: string | null;
  payFrequency: string | null;
  baseSalaryPerPeriod: number | null;
  grossYtd: number | null;
  lessBonus: number | null;
  nonBaseToAllocate: number | null;
  nonBaseToOmit: number | null;
  useDetailedYtd: boolean;
  useSecondPayslip: boolean;
  hecsFlag: boolean;
  hecsAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposedHomeLoan {
  id: string;
  clientProfileId: string;
  productType: string | null;
  investmentFlag: boolean;
  loanAmount: number;
  termYears: number;
  ioTermYears: number;
  interestRate: number | null;
  lvr: number | null;
  overrideRate: boolean;
  securityLinks: number;
  ownership: string | null;
  includeInServicing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExistingHomeLoan {
  id: string;
  clientProfileId: string;
  locFlag: boolean;
  investmentFlag: boolean;
  loanAmount: number;
  interestRate: number;
  termYears: number;
  ioTermYears: number;
  monthlyRepayment: number | null;
  lender: string | null;
  securityLinks: number;
  ownership: string | null;
  includeInServicing: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PersonalLiabilityType = 'CREDIT_CARD' | 'CAR_LOAN' | 'PERSONAL_LOAN' | 'HECS' | 'OTHER';

export interface PersonalLiability {
  id: string;
  clientProfileId: string;
  type: PersonalLiabilityType;
  limit: number | null;
  interestRate: number | null;
  remainingTermYears: number | null;
  repaymentAmount: number | null;
  includeInServicing: boolean;
  ownership: string | null;
  ownershipPercent: number | null;
  lender: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LivingExpenses {
  id: string;
  clientProfileId: string;
  basicExpenseAmount: number;
  basicExpenseFrequency: Frequency;
  propertyTax: number | null;
  strataBodyCorp: number | null;
  privateSchoolFees: number | null;
  childSupportMaintenance: number | null;
  privateHealthInsurance: number | null;
  lifeInsurance: number | null;
  secondaryResidenceCosts: number | null;
  otherNonHem: number | null;
  useNotionalRent: boolean;
  rentBoardAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dependant {
  id: string;
  applicantId: string;
  age: number;
}

export interface Applicant {
  id: string;
  householdId: string;
  name: string;
  relationship: string | null;
  postcode: string | null;
  dependantsCount: number;
  dependants?: Dependant[];
}

export interface Household {
  id: string;
  clientProfileId: string;
  name: string;
  applicants?: Applicant[];
}

// === Application Status Timeline (Mandate 2) ===
export type StageStatus = 'completed' | 'active' | 'upcoming' | 'skipped';

export interface ApplicationStage {
  id: string;
  userId: string;
  key: string;
  label: string;
  group: string;
  orderIndex: number;
  status: StageStatus;
  completedAt: string | null;
  dueDate: string | null;
  note: string | null;
  hasDate: boolean;
  createdAt: string;
  updatedAt: string;
}

// === Messaging Hub (Mandate 4C) ===
export type SenderRole = 'CLIENT' | 'ADMIN' | 'SYSTEM';
export type MessageType = 'text' | 'stage_update' | 'document_request' | 'borrowing_summary' | 'meeting_request';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  clientUserId: string;
  senderRole: SenderRole;
  body: string | null;
  type: MessageType;
  cardData: string | null;
  status: MessageStatus;
  resolved: boolean;
  flagged: boolean;
  reactions: string | null;
  createdAt: string;
}
