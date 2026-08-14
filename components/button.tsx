import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  variant?:
    | "primary"
    | "secondary"
    | "disabled"
    | "link"
    | "success"
    | "delete";
  icon?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export const Button = ({
  disabled,
  className,
  children,
  variant,
  onClick,
  ...props
}: ButtonProps) => {
  if (disabled) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`bg-ash/20 rounded-[10px] border border-white/10 cursor-not-allowed px-8 h-[30px] flex items-center justify-center py-3 text-[12px] uppercase text-white/20 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "primary") {
    return (
      <button
        onClick={onClick}
        className={`px-8 py-3 h-[30px] flex items-center bg-blue-600 hover:bg-blue-500 text-white rounded-[8px] text-[10px] font-semibold  justify-center uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] flex items-center justify-center ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
  if (variant === "secondary") {
    return (
      <button
        onClick={onClick}
        className={`px-8 h-[30px] flex items-center py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[8px] text-[10px] font-semibold  justify-center uppercase tracking-widest transition-all ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
  if (variant === "success") {
    return (
      <button
        onClick={onClick}
        className={`px-8 h-[30px] flex items-center py-3 bg-green hover:bg-opacity-90 text-primary rounded-[8px] text-[10px] font-semibold uppercase  justify-center tracking-widest transition-all ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
  if (variant === "delete") {
    return (
      <button
        onClick={onClick}
        className={`px-8 h-[30px] flex items-center py-3 bg-red hover:bg-opacity-90 text-primary rounded-[8px] text-[10px] font-semibold uppercase  justify-center tracking-widest transition-all ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      disabled={disabled}
      className={`disabled:bg-ash/20 disabled:border disabled:border-gray-500 text-[12px]  justify-center font-semibold uppercase ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
