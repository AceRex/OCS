import React from "react";

export const Input = ({
  type = "text",
  value,
  onChange,
  placeholder = "",
  className = "",
  ...props
}: {
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  [key: string]: any;
}) => {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full h-[40px] bg-primary border border-light/30 rounded-[12px] px-3 py-2 text-light focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-primary/50 placeholder:text-[12px] placeholder:text-light/50 !${className}`}
      {...props}
    />
  );
};

export const input = () => {
  return <></>;
};
