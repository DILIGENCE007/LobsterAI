# Windows 表格重算等待问题修复设计文档

## 1. 概述

Excel 专家首问实际生成了工作簿，但使用 `SKILLs/xlsx/recalc.py` 时长时间停在进程轮询。该脚本原仅明确支持 Linux/macOS，Windows 分支既使用了错误的宏目录，也未执行 timeout，缺少宏时仍可能持续等待。

## 2. 用户场景

Windows 用户直接体验生成含公式的 XLSX，应在有限时间内得到验证结果。重算不能弹出窗口、操作用户的 Office 窗口，失败时不能损坏原文件。

## 3. 功能需求

- 支持 Windows XLSX 公式重算和错误扫描，并设置执行超时。
- 使用独立工作目录，不操作用户正在使用的 Office 进程。
- 验证成功后才替换输出；失败或源文件并发修改时保留原文件。

## 4. 实现方案

Windows `.xlsx` 使用 `soffice.com` 的 headless 转换，在文件同卷的临时目录内创建独立 LibreOffice profile 和输出目录。只在转换成功、输出工作簿可读取且源文件未被并发修改后原子替换原文件。无需安装宏，也不连接用户正在使用的 LibreOffice 实例。

进程等待使用 Python timeout。超时时只终止本次创建的 PID 及子进程，并返回错误；不按进程名称批量结束 Office。未找到 LibreOffice、转换失败、不支持的宏工作簿或用户并发修改均保留原文件。Linux/macOS 原有流程不变。

参数依据：[LibreOffice 官方启动参数文档](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)。

## 5. 边界情况

| 场景 | 处理 |
|------|------|
| Windows `.xlsm` 等格式 | 明确不支持，不转换为 XLSX，避免宏丢失 |
| 已有 Office 窗口 | 使用独立 profile，无键鼠操作 |
| 无效输出或超时 | 保留原文件并报错 |
| 重算期间用户保存 | 检测大小/修改时间变化，不覆盖用户更新 |
| 中文路径和空格 | 使用参数数组和 profile URI，不拼接 shell 命令 |

## 6. 验收标准

- 单元测试覆盖成功、超时、原文件保留、不支持格式、并发修改和损坏输出。
- 对专家实际生成的 XLSX 执行重算，验证公式缓存、汇总值、图表及条件格式保留。
- 从真实 Electron 会话再次原样发送 Excel 首问，确认无需用户介入完成。
