"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"

interface DateRangePickerProps {
  dateFrom?: string
  dateTo?: string
  onDateChange: (dateFrom: string | undefined, dateTo: string | undefined) => void
  className?: string
}

type PresetOption = {
  label: string
  getValue: () => { from: Date; to: Date }
}

export function DateRangePicker({
  dateFrom,
  dateTo,
  onDateChange,
  className,
}: DateRangePickerProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [selectedRange, setSelectedRange] = React.useState<DateRange | undefined>(
    dateFrom && dateTo
      ? {
          from: new Date(dateFrom),
          to: new Date(dateTo),
        }
      : undefined
  )

  // Update selected range when props change
  React.useEffect(() => {
    if (dateFrom && dateTo && dateFrom.trim() && dateTo.trim()) {
      try {
        setSelectedRange({
          from: new Date(dateFrom),
          to: new Date(dateTo),
        })
      } catch {
        setSelectedRange(undefined)
      }
    } else {
      setSelectedRange(undefined)
    }
  }, [dateFrom, dateTo])

  const getPresetOptions = (): PresetOption[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    const lastYearStart = new Date(today.getFullYear() - 1, 0, 1)
    const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31)

    return [
      {
        label: "Today",
        getValue: () => ({ from: today, to: today }),
      },
      {
        label: "Yesterday",
        getValue: () => ({ from: yesterday, to: yesterday }),
      },
      {
        label: "This Month",
        getValue: () => ({ from: thisMonthStart, to: thisMonthEnd }),
      },
      {
        label: "Last Year",
        getValue: () => ({ from: lastYearStart, to: lastYearEnd }),
      },
    ]
  }

  const handlePresetSelect = (preset: PresetOption) => {
    const { from, to } = preset.getValue()
    setSelectedRange({ from, to })
  }

  const handleApply = () => {
    if (selectedRange?.from && selectedRange?.to) {
      const fromStr = format(selectedRange.from, "yyyy-MM-dd")
      const toStr = format(selectedRange.to, "yyyy-MM-dd")
      onDateChange(fromStr, toStr)
    } else if (selectedRange?.from) {
      const fromStr = format(selectedRange.from, "yyyy-MM-dd")
      onDateChange(fromStr, undefined)
    } else {
      onDateChange(undefined, undefined)
    }
    setOpen(false)
  }

  const handleCancel = () => {
    // Reset to original values
    if (dateFrom && dateTo) {
      setSelectedRange({
        from: new Date(dateFrom),
        to: new Date(dateTo),
      })
    } else {
      setSelectedRange(undefined)
    }
    setOpen(false)
  }

  const handleClear = () => {
    setSelectedRange(undefined)
    onDateChange(undefined, undefined)
    setOpen(false)
  }

  const displayText = React.useMemo(() => {
    if (dateFrom && dateTo && dateFrom.trim() && dateTo.trim()) {
      try {
        return `${format(new Date(dateFrom), "MMM d, yyyy")} - ${format(new Date(dateTo), "MMM d, yyyy")}`
      } catch {
        return "Select date range"
      }
    }
    if (dateFrom && dateFrom.trim()) {
      try {
        return format(new Date(dateFrom), "MMM d, yyyy")
      } catch {
        return "Select date range"
      }
    }
    return "Select date range"
  }, [dateFrom, dateTo])

  const isPresetActive = React.useCallback(
    (preset: PresetOption) => {
      if (!selectedRange?.from || !selectedRange?.to) return false
      const { from, to } = preset.getValue()
      return (
        format(selectedRange.from, "yyyy-MM-dd") === format(from, "yyyy-MM-dd") &&
        format(selectedRange.to, "yyyy-MM-dd") === format(to, "yyyy-MM-dd")
      )
    },
    [selectedRange]
  )

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal rounded-sm",
              !selectedRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 size-4" />
            {displayText}
            <ChevronDownIcon className="ml-auto size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full max-w-sm sm:w-auto sm:max-w-none p-0" align="start">
          <div className="p-3">
            {/* Preset pills */}
            <div className="flex flex-wrap gap-2 pb-3">
              {getPresetOptions().map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect(preset)}
                  className={cn(
                    "rounded-full",
                    isPresetActive(preset) && "bg-accent text-accent-foreground"
                  )}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <Calendar
              initialFocus
              mode="range"
              defaultMonth={selectedRange?.from || new Date()}
              selected={selectedRange}
              onSelect={setSelectedRange}
              numberOfMonths={isMobile ? 1 : 2}
              className="rounded-md border-0"
            />
            
            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              {(dateFrom || dateTo) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                >
                  Clear
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleApply}
                disabled={!selectedRange?.from || !selectedRange?.to}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
