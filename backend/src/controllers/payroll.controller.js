const { z } = require('zod');
const Employee = require('../models/Employee');
const SalaryPayment = require('../models/SalaryPayment');
const Expense = require('../models/Expense');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { nextNumber } = require('../utils/counter');
const { round2 } = require('../utils/money');
const { objectId } = require('./medicine.controller');

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must look like 2026-10');
const employeeSchema = z.object({
  name: z.string().trim().min(2).max(100), designation: z.string().trim().max(60).optional(), phone: z.string().trim().max(30).optional(),
  monthlySalary: z.number().min(0), joinDate: z.string().optional(), notes: z.string().trim().max(200).optional(), isActive: z.boolean().optional(),
});
const employeeUpdateSchema = employeeSchema.partial();
const paymentSchema = z.object({
  employee: objectId, month, kind: z.enum(['salary', 'advance', 'bonus']), amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'bank_transfer']).optional(), note: z.string().trim().max(150).optional(),
});
const voidSchema = z.object({ reason: z.string().trim().min(3, 'A reason is required').max(200) });

const listEmployees = asyncHandler(async (req, res) => {
  const filter = req.query.all === 'true' ? {} : { isActive: true };
  res.json({ success: true, data: await Employee.find(filter).sort({ name: 1 }) });
});
const createEmployee = asyncHandler(async (req, res) => {
  const e = await Employee.create({ ...req.body, joinDate: req.body.joinDate ? new Date(req.body.joinDate) : undefined });
  await audit(req, 'employee.create', 'Employee', e._id, { name: e.name, salary: e.monthlySalary });
  res.status(201).json({ success: true, data: e });
});
const updateEmployee = asyncHandler(async (req, res) => {
  const before = await Employee.findById(req.params.id);
  if (!before) throw ApiError.notFound('Employee not found');
  const salaryChange = req.body.monthlySalary !== undefined && req.body.monthlySalary !== before.monthlySalary ? { from: before.monthlySalary, to: req.body.monthlySalary } : undefined;
  Object.assign(before, req.body, req.body.joinDate ? { joinDate: new Date(req.body.joinDate) } : {});
  await before.save();
  await audit(req, 'employee.update', 'Employee', before._id, { fields: Object.keys(req.body), salaryChange });
  res.json({ success: true, data: before });
});

// One row per employee for a month: what is due, what was paid, what is left.
// remaining = salary - salary already paid - advances taken that month. Bonus is on top and tracked separately.
async function sheetFor(m) {
  const [emps, pays] = await Promise.all([Employee.find({ isActive: true }).sort({ name: 1 }).lean(), SalaryPayment.find({ month: m, isVoided: false }).lean()]);
  return emps.map((e) => {
    const mine = pays.filter((p) => String(p.employee) === String(e._id));
    const tot = (k) => round2(mine.filter((p) => p.kind === k).reduce((s, p) => s + p.amount, 0));
    const salaryPaid = tot('salary'); const advances = tot('advance'); const bonus = tot('bonus');
    return { employee: e, base: e.monthlySalary, salaryPaid, advances, bonus, totalPaid: round2(salaryPaid + advances + bonus), remaining: round2(e.monthlySalary - salaryPaid - advances), payments: mine.map((p) => ({ _id: p._id, kind: p.kind, amount: p.amount, method: p.method, note: p.note, at: p.createdAt })) };
  });
}

const sheet = asyncHandler(async (req, res) => {
  const parsed = month.safeParse(req.query.month);
  if (!parsed.success) throw ApiError.badRequest('Month must look like 2026-10');
  const data = await sheetFor(parsed.data);
  const sum = (f) => round2(data.reduce((s, r) => s + f(r), 0));
  res.json({ success: true, month: parsed.data, data, totals: { base: sum((r) => r.base), paid: sum((r) => r.totalPaid), remaining: sum((r) => Math.max(r.remaining, 0)), advances: sum((r) => r.advances), bonus: sum((r) => r.bonus) } });
});

const pay = asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.body.employee);
  if (!emp || !emp.isActive) throw ApiError.badRequest('Employee not found or inactive');
  const { kind, amount } = req.body;
  if (kind === 'salary') {
    const row = (await sheetFor(req.body.month)).find((r) => String(r.employee._id) === String(emp._id));
    if (amount > round2(row.remaining) + 0.001) throw ApiError.badRequest(`Only ${row.remaining} is left to pay for ${req.body.month} (salary ${row.base}, advances ${row.advances}, already paid ${row.salaryPaid})`);
  }
  const label = { salary: 'Salary', advance: 'Advance', bonus: 'Bonus' }[kind];
  const expense = await Expense.create({
    expenseNo: await nextNumber('expense', 'EXP'), category: 'salaries', amount, date: new Date(), paymentMethod: req.body.method || 'cash',
    description: `${label} - ${emp.name} (${req.body.month})`, createdBy: req.user._id, createdByName: req.user.name,
  });
  let p;
  try {
    p = await SalaryPayment.create({ ...req.body, employeeName: emp.name, expense: expense._id, createdBy: req.user._id, createdByName: req.user.name });
  } catch (e) {
    await Expense.deleteOne({ _id: expense._id }); // never leave an expense without its payment
    throw e;
  }
  await audit(req, 'payroll.pay', 'SalaryPayment', p._id, { employee: emp.name, month: p.month, kind, amount });
  res.status(201).json({ success: true, data: p });
});

const voidPayment = asyncHandler(async (req, res) => {
  const r = await SalaryPayment.findOneAndUpdate({ _id: req.params.id, isVoided: false }, { $set: { isVoided: true, voidReason: req.body.reason } }, { returnDocument: 'after' });
  if (!r) throw ApiError.notFound('Payment not found or already voided');
  if (r.expense) await Expense.updateOne({ _id: r.expense }, { $set: { isVoided: true, voidReason: `Payroll payment voided: ${req.body.reason}`, voidedBy: req.user._id } });
  await audit(req, 'payroll.void', 'SalaryPayment', r._id, { reason: req.body.reason, amount: r.amount });
  res.json({ success: true, message: 'Payment voided' });
});

module.exports = { listEmployees, createEmployee, updateEmployee, sheet, pay, voidPayment, employeeSchema, employeeUpdateSchema, paymentSchema, voidSchema };
