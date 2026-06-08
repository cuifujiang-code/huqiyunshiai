import type { ExamDataReference, SubjectScore } from '../types/planning'
import { GAOBAO_PROVINCE_NAMES } from '../data/gaokaoProvinces2025'
import {
  LATEST_EXAM_DATA_YEAR,
  getSubjectFullScores,
  lookupExamReference,
} from '../data/examReferenceData'
import { ZHEJIANG_CITIES } from '../data/zhejiangZhongkao2025'

const PROVINCE_CITY_MAP: Record<string, string[]> = {
  北京: ['北京市'],
  天津: ['天津市'],
  河北: ['石家庄', '唐山', '保定', '邯郸', '秦皇岛', '廊坊', '张家口', '承德', '沧州', '衡水', '邢台'],
  山西: ['太原', '大同', '运城', '长治', '临汾', '晋中', '阳泉', '朔州'],
  内蒙古: ['呼和浩特', '包头', '鄂尔多斯', '赤峰', '通辽', '呼伦贝尔'],
  辽宁: ['沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口'],
  吉林: ['长春', '吉林', '四平', '延边', '通化', '白城'],
  黑龙江: ['哈尔滨', '齐齐哈尔', '大庆', '牡丹江', '佳木斯', '绥化'],
  上海: ['上海市'],
  江苏: ['南京', '苏州', '无锡', '常州', '南通', '徐州', '扬州', '镇江', '泰州', '盐城', '淮安', '连云港', '宿迁'],
  浙江: ZHEJIANG_CITIES,
  安徽: ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '安庆', '阜阳', '滁州', '六安'],
  福建: ['福州', '厦门', '泉州', '漳州', '莆田', '龙岩', '三明', '南平'],
  江西: ['南昌', '赣州', '九江', '上饶', '宜春', '吉安', '抚州', '景德镇'],
  山东: ['济南', '青岛', '烟台', '潍坊', '济宁', '临沂', '淄博', '威海', '泰安', '德州'],
  河南: ['郑州', '洛阳', '南阳', '新乡', '开封', '安阳', '许昌', '焦作', '平顶山'],
  湖北: ['武汉', '襄阳', '宜昌', '荆州', '十堰', '孝感', '黄冈', '黄石'],
  湖南: ['长沙', '株洲', '湘潭', '衡阳', '岳阳', '常德', '郴州', '益阳'],
  广东: ['广州', '深圳', '东莞', '佛山', '珠海', '中山', '惠州', '江门', '汕头', '湛江', '茂名', '肇庆'],
  广西: ['南宁', '柳州', '桂林', '梧州', '北海', '玉林', '百色'],
  海南: ['海口', '三亚', '儋州', '琼海'],
  重庆: ['重庆市'],
  四川: ['成都', '绵阳', '德阳', '南充', '宜宾', '泸州', '达州', '乐山', '自贡', '攀枝花'],
  贵州: ['贵阳', '遵义', '六盘水', '安顺', '毕节', '铜仁'],
  云南: ['昆明', '曲靖', '玉溪', '大理', '红河', '楚雄', '昭通'],
  西藏: ['拉萨', '日喀则', '昌都', '林芝'],
  陕西: ['西安', '咸阳', '宝鸡', '渭南', '汉中', '延安', '榆林'],
  甘肃: ['兰州', '天水', '酒泉', '张掖', '武威', '白银'],
  青海: ['西宁', '海东', '格尔木'],
  宁夏: ['银川', '石嘴山', '吴忠', '固原'],
  新疆: ['乌鲁木齐', '克拉玛依', '喀什', '伊犁', '昌吉', '阿克苏'],
}

export { LATEST_EXAM_DATA_YEAR }

export function examTypeFromGrade(grade: string): '中考' | '高考' {
  return ['高一', '高二', '高三'].includes(grade) ? '高考' : '中考'
}

export function buildDefaultSubjectScores(
  province: string,
  grade: string,
  existing?: SubjectScore[],
): SubjectScore[] {
  const examType = examTypeFromGrade(grade)
  const configs = getSubjectFullScores(province || 'default', examType)
  const oldMap = new Map((existing ?? []).map((s) => [s.subject, s]))

  return configs.map((cfg) => {
    const prev = oldMap.get(cfg.subject)
    return {
      subject: cfg.subject,
      score: prev?.score ?? null,
      fullScore: prev?.fullScore ?? cfg.fullScore,
      classRank: prev?.classRank ?? null,
      schoolRank: prev?.schoolRank ?? null,
      scoreTrend: prev?.scoreTrend ?? 'stable',
    }
  })
}

export async function fetchExamData(params: {
  province: string
  city: string
  examType: '中考' | '高考'
  year?: number
}): Promise<{ success: boolean; data?: ExamDataReference; message?: string }> {
  if (!params.province.trim()) {
    return { success: false, message: '请选择省份' }
  }
  if (!params.city.trim()) {
    return { success: false, message: '请选择城市' }
  }

  const year = params.year ?? LATEST_EXAM_DATA_YEAR

  await new Promise((resolve) => setTimeout(resolve, 200))

  try {
    const data = lookupExamReference(params.province, params.city, params.examType)
    return {
      success: true,
      data: { ...data, year },
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : '获取考试数据失败',
    }
  }
}

export function getSupportedProvinces(): string[] {
  const fromMap = Object.keys(PROVINCE_CITY_MAP)
  const merged = new Set([...GAOBAO_PROVINCE_NAMES, ...fromMap])
  return Array.from(merged).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function getCitiesByProvince(province: string): string[] {
  return PROVINCE_CITY_MAP[province] ?? []
}
