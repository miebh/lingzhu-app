package preferences

// TimelineDetail is the persisted category map for the transcript.
// The JSON shape mirrors the desktop client so one document describes both.
type TimelineDetail struct {
	Shell      TimelineCategoryDetail  `json:"shell"`
	Edit       TimelineCategoryDetail  `json:"edit"`
	Thinking   TimelineCategoryDetail  `json:"thinking"`
	Subagents  TimelinePlacementDetail `json:"subagents"`
	Notices    TimelinePlacementDetail `json:"notices"`
	Tools      TimelinePlacementDetail `json:"tools"`
	Commentary TimelinePlacementDetail `json:"commentary"`
}

// TimelineCategoryDetail controls one category with expandable details.
type TimelineCategoryDetail struct {
	Placement string `json:"placement"`
	Details   string `json:"details"`
}

// TimelinePlacementDetail controls a category without detail expansion.
type TimelinePlacementDetail struct {
	Placement string `json:"placement"`
}

const (
	placementSeparate = "separate"
	placementGrouped  = "grouped"
	placementHidden   = "hidden"

	expansionCollapsed = "collapsed"
	expansionExpanded  = "expanded"
)

func defaultTimelineDetail() TimelineDetail {
	return timelineDetailPreset("compact")
}

func timelineDetailPreset(name string) TimelineDetail {
	switch name {
	case "everything":
		return TimelineDetail{
			Shell:      TimelineCategoryDetail{Placement: placementSeparate, Details: expansionExpanded},
			Edit:       TimelineCategoryDetail{Placement: placementSeparate, Details: expansionExpanded},
			Thinking:   TimelineCategoryDetail{Placement: placementSeparate, Details: expansionExpanded},
			Subagents:  TimelinePlacementDetail{Placement: placementSeparate},
			Notices:    TimelinePlacementDetail{Placement: placementSeparate},
			Tools:      TimelinePlacementDetail{Placement: placementSeparate},
			Commentary: TimelinePlacementDetail{Placement: placementSeparate},
		}
	case "compact":
		return TimelineDetail{
			Shell:      TimelineCategoryDetail{Placement: placementGrouped, Details: expansionCollapsed},
			Edit:       TimelineCategoryDetail{Placement: placementGrouped, Details: expansionCollapsed},
			Thinking:   TimelineCategoryDetail{Placement: placementGrouped, Details: expansionCollapsed},
			Subagents:  TimelinePlacementDetail{Placement: placementSeparate},
			Notices:    TimelinePlacementDetail{Placement: placementGrouped},
			Tools:      TimelinePlacementDetail{Placement: placementGrouped},
			Commentary: TimelinePlacementDetail{Placement: placementSeparate},
		}
	case "quiet":
		return TimelineDetail{
			Shell:      TimelineCategoryDetail{Placement: placementHidden, Details: expansionCollapsed},
			Edit:       TimelineCategoryDetail{Placement: placementGrouped, Details: expansionCollapsed},
			Thinking:   TimelineCategoryDetail{Placement: placementHidden, Details: expansionCollapsed},
			Subagents:  TimelinePlacementDetail{Placement: placementSeparate},
			Notices:    TimelinePlacementDetail{Placement: placementHidden},
			Tools:      TimelinePlacementDetail{Placement: placementHidden},
			Commentary: TimelinePlacementDetail{Placement: placementSeparate},
		}
	case "text-only":
		return TimelineDetail{
			Shell:      TimelineCategoryDetail{Placement: placementHidden, Details: expansionCollapsed},
			Edit:       TimelineCategoryDetail{Placement: placementHidden, Details: expansionCollapsed},
			Thinking:   TimelineCategoryDetail{Placement: placementHidden, Details: expansionCollapsed},
			Subagents:  TimelinePlacementDetail{Placement: placementHidden},
			Notices:    TimelinePlacementDetail{Placement: placementHidden},
			Tools:      TimelinePlacementDetail{Placement: placementHidden},
			Commentary: TimelinePlacementDetail{Placement: placementSeparate},
		}
	default:
		// detailed
		return TimelineDetail{
			Shell:      TimelineCategoryDetail{Placement: placementSeparate, Details: expansionExpanded},
			Edit:       TimelineCategoryDetail{Placement: placementSeparate, Details: expansionExpanded},
			Thinking:   TimelineCategoryDetail{Placement: placementGrouped, Details: expansionCollapsed},
			Subagents:  TimelinePlacementDetail{Placement: placementSeparate},
			Notices:    TimelinePlacementDetail{Placement: placementGrouped},
			Tools:      TimelinePlacementDetail{Placement: placementGrouped},
			Commentary: TimelinePlacementDetail{Placement: placementSeparate},
		}
	}
}

func normalizeTimelineDetail(value, fallback TimelineDetail) TimelineDetail {
	return TimelineDetail{
		Shell:      normalizeCategory(value.Shell, fallback.Shell),
		Edit:       normalizeCategory(value.Edit, fallback.Edit),
		Thinking:   normalizeCategory(value.Thinking, fallback.Thinking),
		Subagents:  normalizePlacement(value.Subagents, fallback.Subagents),
		Notices:    normalizePlacement(value.Notices, fallback.Notices),
		Tools:      normalizePlacement(value.Tools, fallback.Tools),
		Commentary: normalizePlacement(value.Commentary, fallback.Commentary),
	}
}

func normalizeCategory(value, fallback TimelineCategoryDetail) TimelineCategoryDetail {
	if !validPlacement(value.Placement) {
		value.Placement = fallback.Placement
	}
	if value.Details != expansionCollapsed && value.Details != expansionExpanded {
		value.Details = fallback.Details
	}
	return value
}

func normalizePlacement(value, fallback TimelinePlacementDetail) TimelinePlacementDetail {
	if !validPlacement(value.Placement) {
		value.Placement = fallback.Placement
	}
	return value
}

func validPlacement(value string) bool {
	return value == placementSeparate || value == placementGrouped || value == placementHidden
}
