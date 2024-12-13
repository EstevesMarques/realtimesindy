import React from 'react';
import './Button.scss';

import { Icon } from 'react-feather';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: Icon;
  iconPosition?: 'start' | 'end';
  iconColor?: 'red' | 'green' | 'grey';
  iconFill?: boolean;
  buttonStyle?: 'regular' | 'action' | 'alert' | 'flush' | 'green' | 'info';
  iconOnly?: boolean;
}

export function Button({
  label = 'Okay',
  icon = void 0,
  iconPosition = 'start',
  iconColor = void 0,
  iconFill = false,
  buttonStyle = 'regular',
  iconOnly = false,
  ...rest
}: ButtonProps) {
  const isIconOnly = !label && !!icon;
  const StartIcon = iconPosition === 'start' ? icon : null;
  const EndIcon = iconPosition === 'end' ? icon : null;
  const classList = [];
  if (iconColor) {
    classList.push(`icon-${iconColor}`);
  }
  if (iconFill) {
    classList.push(`icon-fill`);
  }
  if (iconOnly) {
    classList.push('button-icon-only');
  }

  classList.push(`button-style-${buttonStyle}`);

  return (
    <button data-component="Button" className={classList.join(' ')} {...rest}>
      {StartIcon && (
        <span className="icon">
          <StartIcon />
        </span>
      )}
      {!iconOnly && label && <span className="label">{label}</span>}
      {/* <span className="label">{label}</span> */}
      {EndIcon && (
        <span className="icon">
          <EndIcon />
        </span>
      )}
    </button>
  );
}
