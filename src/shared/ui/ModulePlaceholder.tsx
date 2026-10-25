import { Alert, Card, Tag } from 'antd';
import { PageHeader } from './PageHeader';

interface Props {
  title: string;
  description: string;
  directory: string;
  tasks: string[];
}

export function ModulePlaceholder({
  title,
  description,
  directory,
  tasks,
}: Props) {
  return (
    <>
      <PageHeader
        eyebrow="EXTENSION MODULE"
        title={title}
        description={description}
        extra={<Tag>待开发</Tag>}
      />
      <Alert
        type="info"
        showIcon
        title="这是扩展入口，不是已完成功能"
        description="基础路由与模块边界已准备好。认领任务后，可在独立目录中开发并提交 PR。"
      />
      <Card title="建议从这里开始" className="section-gap">
        <p>
          模块目录：<code>{directory}</code>
        </p>
        <ol className="extension-tasks">
          {tasks.map((task, index) => (
            <li key={task}>
              <span className="task-index">0{index + 1}</span>
              {task}
            </li>
          ))}
        </ol>
        <a
          href="https://github.com/Lingfengalg/math-analysis-workbench/issues"
          target="_blank"
          rel="noreferrer"
        >
          查看协作任务 ↗
        </a>
      </Card>
    </>
  );
}
