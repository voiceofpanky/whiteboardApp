import { Tool } from '../components/Toolbar/Toolbar.types';
import styles from './Toolbar.module.css';

interface ToolbarProps {
    onToolSelect: (tool: Tool) => void;
}
export const Toolbar = ({ onToolSelect }: ToolbarProps) => {
    const tools: { name: string; tool: Tool }[] = [
        { name: 'Pencil', tool: 'pencil' },
        { name: 'Rectangle', tool: 'rectangle' },
        { name: 'Circle', tool: 'circle' },
        { name: 'Select', tool: 'select' },
        { name: 'Clear', tool: 'clear' },
    ];
    return (
        <div className={styles.toolbar}>
            {tools.map(({ name, tool }) => (
                <button
                    key={tool}
                    className={styles.toolButton}
                    onClick={() => onToolSelect(tool)}
                >
                    {name}
                </button>
            ))}
        </div>
    );
};