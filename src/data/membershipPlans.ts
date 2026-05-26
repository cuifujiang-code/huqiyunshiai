import type { SubscriptionPlan } from '../types/membership'

export const TEACHER_PLANS: SubscriptionPlan[] = [
  {
    id: 'teacher_monthly',
    name: '教师版 · 月费订阅',
    price: 49,
    priceLabel: '￥49/月',
    period: 'monthly',
    features: [
      '无限题库存储',
      'AI智能出题（每月100次）',
      '试卷导出PDF',
      '学生管理（最多200人）',
    ],
    cta: '立即订阅',
    role: 'teacher',
  },
  {
    id: 'teacher_yearly',
    name: '教师版 · 年度订阅',
    price: 399,
    priceLabel: '￥399/年',
    period: 'yearly',
    badge: '最受欢迎',
    recommended: true,
    features: [
      '包含月费所有权益',
      'AI出题次数提升至每月300次',
      '学生管理人数提升至500人',
      '专属客服通道',
    ],
    cta: '立即订阅',
    role: 'teacher',
  },
]

export const STUDENT_PLANS: SubscriptionPlan[] = [
  {
    id: 'student_per_use',
    name: '学生版 · 单次诊断',
    price: 9.9,
    priceLabel: '￥9.9/次',
    period: 'once',
    features: [
      '一份完整AI学习诊断报告',
      '薄弱知识点分析',
      '个性化提升计划',
    ],
    cta: '立即购买',
    role: 'student',
  },
  {
    id: 'student_yearly',
    name: '学生版 · 年度会员',
    price: 198,
    priceLabel: '￥198/年',
    period: 'yearly',
    badge: '最受欢迎',
    recommended: true,
    features: [
      '无限次AI诊断',
      '历次诊断报告存档',
      '志愿填报助手使用权',
    ],
    cta: '立即订阅',
    role: 'student',
  },
]

export const ALL_PLANS: SubscriptionPlan[] = [...TEACHER_PLANS, ...STUDENT_PLANS]

export function getPlanById(id: string): SubscriptionPlan | undefined {
  return ALL_PLANS.find((p) => p.id === id)
}
