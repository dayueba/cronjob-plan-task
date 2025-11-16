# 记录补充脚本使用说明

## 功能说明
当排查任务系统中某些时间点的记录丢失时，可以使用此脚本补充缺失的记录。脚本会根据任务的周期设置，在指定的时间范围内生成缺失的记录。

## 安装依赖
在使用脚本之前，请确保已安装所有依赖：
```bash
npm install
```

## 使用方法

### 基本用法
```bash
# 补充2023年1月1日至1月31日的所有记录
npm run fill-records -- --start-date 2023-01-01 --end-date 2023-01-31
```

### 指定特定任务
```bash
# 补充特定任务ID在2023年1月的记录
npm run fill-records -- --start-date 2023-01-01 --end-date 2023-01-31 --task-id 1

# 补充特定任务名称在2023年1月的记录
npm run fill-records -- --start-date 2023-01-01 --end-date 2023-01-31 --task-name "数据库检查"
```

### 预览模式（不实际执行）
```bash
# 仅查看将要补充的记录，不实际执行
npm run fill-records -- --start-date 2023-01-01 --end-date 2023-01-31 --dry-run
```

### 自定义记录状态和结果
```bash
# 自定义补充记录的状态和结果
npm run fill-records -- --start-date 2023-01-01 --end-date 2023-01-31 --status "补录" --result "通过补录脚本生成"
```

## 参数说明

| 参数 | 说明 | 是否必需 | 默认值 |
|------|------|----------|--------|
| --start-date | 开始日期 (YYYY-MM-DD) | 是 | 无 |
| --end-date | 结束日期 (YYYY-MM-DD) | 是 | 无 |
| --task-id | 特定任务ID | 否 | 无 |
| --task-name | 特定任务名称（支持模糊匹配） | 否 | 无 |
| --status | 补充记录的状态 | 否 | "补录" |
| --result | 补充记录的结果 | 否 | "由补录脚本生成" |
| --dry-run | 仅显示将要补充的记录，不实际执行 | 否 | false |

## 使用示例

### 1. 补充所有任务在某个月的记录
```bash
npm run fill-records -- --start-date 2023-03-01 --end-date 2023-03-31
```

### 2. 补充特定任务在某个日期范围的记录
```bash
npm run fill-records -- --start-date 2023-02-01 --end-date 2023-02-28 --task-id 5
```

### 3. 预览将要补充的记录
```bash
npm run fill-records -- --start-date 2023-01-01 --end-date 2023-01-31 --dry-run
```

## 注意事项

1. 脚本会自动跳过已存在的记录，避免重复插入
2. 只会处理启用状态的任务（enabled=1）
3. 执行前建议先使用`--dry-run`参数预览将要补充的记录
4. 脚本会记录详细的日志信息，便于追踪执行过程
5. 如需修改补充记录的状态或结果，可使用相应的参数

## 日志查看
脚本执行过程中会生成日志文件，可以在`logs/`目录下查看：
- `logs/combined.log` - 所有日志信息
- `logs/error.log` - 错误日志信息

## 故障排除

如果执行过程中遇到问题，请检查：
1. 数据库连接是否正常
2. 指定的日期范围是否有效
3. 任务ID或任务名称是否存在
4. 查看日志文件获取更多错误信息