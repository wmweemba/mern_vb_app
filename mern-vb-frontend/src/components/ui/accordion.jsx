import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";

export const Accordion = AccordionPrimitive.Root;
export const AccordionItem = AccordionPrimitive.Item;

export const AccordionTrigger = React.forwardRef(({ children, className = '', ...props }, ref) => (
  <AccordionPrimitive.Header>
    <AccordionPrimitive.Trigger
      ref={ref}
      className={`flex w-full items-center justify-between rounded-lg bg-white shadow p-4 mb-2 text-left font-medium transition-all hover:bg-gray-50 focus:outline-none ${className}`}
      {...props}
    >
      {children}
      <span className="ml-2">▼</span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));

export const AccordionContent = React.forwardRef(({ children, className = '', ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={`px-4 pb-4 ${className}`}
    {...props}
  >
    {children}
  </AccordionPrimitive.Content>
)); 