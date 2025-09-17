"""
Decision tree to evaluate the FoXS fit of the BilboMD results and give a
prediction of what went wrong with the experiment
Ex: not enough flexibility, wrong oligomerization, etc.

Inputs BilboMD results folder into command line 
"""

__author__ = "Joshua Del Mundo"
__version__ = "0.1.0"
__license__ = "SIBYLS"


import copy
import glob
import os
import os.path
import shutil
import json
import argparse
from typing import List

from pdb_utils import calculate_molecular_weight
import bioxtasraw.RAWAPI as raw


# Global constants
MW_ERR_CUTOFF = 0.10
CHI2_CUTOFF_EXCELLENT = 1.0
CHI2_CUTOFF_MODERATE = 2.0
PRINT_FLAG = True


def print_debug(arg):
    """
    print statement with flag for debugging
    """
    if PRINT_FLAG:
        print(arg)


def load_file(path):
    """
    Loads profiles using raw.load_profiles()

    If the file does not have a header which labels the q, experiment, model,
    and error columns, raw.load_profiles() does not interpret it properly.

    If no header, it will add the following header to the first line of the
    multi_state_model file if it doesn't already have it:

    q       exp_intensity   model_intensity error

    TBA: compatibility for FoXS files which use the format:

    q       exp_intensity   error model_intensity
    """

    header_multifoxs = "#  q       exp_intensity   model_intensity error"
    temp_dir = "temp"
    temp_file_path = os.path.join(temp_dir, os.path.basename(path))

    try:
        with open(path, encoding="utf-8") as file:
            file_content = file.read()
            if header_multifoxs in file_content:
                return raw.load_profiles(path)

        # If header is not present, add it and load the profiles
        os.makedirs(temp_dir, exist_ok=True)
        shutil.copy(path, temp_file_path)

        with open(temp_file_path, "r+", encoding="utf-8") as new_file:
            new_file_data = new_file.read()
            new_file.seek(0, 0)
            new_file.write(header_multifoxs + "\n" + new_file_data)

        return raw.load_profiles(temp_file_path)
    finally:
        # Clean up the temporary directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


def mw_bayes(profile):
    """
    Returns the Bayesian MW of a RAW SASM

    Needs to run raw.auto_guinier() first to fill guinier_dict with the correct
      guinier results for MW calc
    """
    raw.auto_guinier(profile)
    mw = raw.mw_bayes(profile)[0]
    return mw


def extract_q_region(prof, q_lower_bound, q_upper_bound):
    """
    Trims a RAW SASM to q_lower_bound < q < q_upper_bound
    """
    region = copy.deepcopy(prof)
    region.setQrange(
        [
            region.closest(region.getQ(), q_lower_bound),
            region.closest(region.getQ(), q_upper_bound),
        ]
    )
    return region


def calculate_chi_square(prof1, prof2):
    """
    Returns the chi-square between two RAW SASM
    """
    chi_square = (1 / len(prof1.getQ())) * sum(
        pow(((prof1.getI() - prof2.getI()) / prof1.getErr()), 2)
    )
    return chi_square


def calculate_residual(prof1, prof2):
    """
    Returns the mean of the residual of all data points between two RAW SASM profiles.
    """
    residuals = (prof1.getI() - prof2.getI()) / prof1.getErr()
    return sum(residuals) / len(residuals)


def best_chi_square_i(cs_models, multi_state_models):
    """
    Selects the best chi-square from all multi-state files in the input folder.

    Returns the index of the best chi-square in cs_models.

    Chooses the first chi-square with less than 20% error compared to the next value.
    If no such chi-square exists, returns the index of the minimum chi-square.
    """
    print_debug("Comparing chi-squares of all multistates")

    # Round and print for debug purposes
    cs_models_rounded = [round(cs, 2) for cs in cs_models]
    print_debug(cs_models_rounded)

    csm_err_threshold = 0.2

    # Handle single value case immediately
    if len(cs_models) == 1:
        return 0

    # Iterate over pairs of chi-square values
    for _, (cs_current, cs_next) in enumerate(zip(cs_models, cs_models[1:])):
        csm_err = abs(cs_next - cs_current) / cs_current

        if csm_err <= csm_err_threshold:
            return _log_and_return_best(cs_current, cs_models, multi_state_models)

    # If no chi-square meets the threshold, return the smallest one
    best_cs = min(cs_models)
    return _log_and_return_best(best_cs, cs_models, multi_state_models)


def _log_and_return_best(best_cs, cs_models, multi_state_models):
    """
    Logs and returns the index of the best chi-square value.
    """
    best_index = cs_models.index(best_cs)
    multi_states_file = multi_state_models[best_index]

    # Extract the multi-state number
    multi_states_num = _extract_model_number(multi_states_file)

    print_debug(
        f"The best chi-square is {round(best_cs, 2)} "
        f"({multi_states_num} multi states)"
    )
    return best_index


def _extract_model_number(filename):
    """
    Extracts the multi-state model number from the filename.
    Assumes the pattern 'multi_state_model_#'.
    """
    start = filename.find("multi_state_model_") + 18
    return filename[start]


def calculate_regional_chi_square_values(
    q_ranges: List[float], eprof, mprof
) -> List[float]:
    """
    Returns a list of chi-square values for each q-region, defined by boundaries in q_ranges.

    Args:
        q_ranges (List[float]): List of boundaries for q values (e.g., [q_min, 0.1, 0.2, q_max]).
        eprof (Profile): Experimental profile data.
        mprof (Profile): Model profile data.

    Returns:
        List[float]: List of chi-square values for each region.
    """
    chi_squares_of_regions = []

    for i in range(len(q_ranges) - 1):
        eregion = extract_q_region(eprof, q_ranges[i], q_ranges[i + 1])
        mregion = extract_q_region(mprof, q_ranges[i], q_ranges[i + 1])
        chi_square_value = calculate_chi_square(eregion, mregion)
        chi_squares_of_regions.append(chi_square_value)

        print_debug(
            f"Chi-square of {round(q_ranges[i], 2)} < q < {round(q_ranges[i + 1], 2)}: "
            f"{round(chi_square_value, 2)}"
        )

    return chi_squares_of_regions


def calculate_regional_residual_values(
    q_ranges: List[float], eprof, mprof
) -> List[float]:
    """
    Returns a list of mean residuals for each q-region, defined by boundaries in q_ranges.

    Args:
        q_ranges (List[float]): List of boundaries for q values.
        eprof (Profile): Experimental profile data.
        mprof (Profile): Model profile data.

    Returns:
        List[float]: List of mean residuals for each region.
    """
    residuals_of_regions = []

    for i in range(len(q_ranges) - 1):
        eregion = extract_q_region(eprof, q_ranges[i], q_ranges[i + 1])
        mregion = extract_q_region(mprof, q_ranges[i], q_ranges[i + 1])
        residual_value = calculate_residual(eregion, mregion)
        residuals_of_regions.append(residual_value)

        print_debug(
            f"Mean residuals of {round(q_ranges[i], 2)} < q < {round(q_ranges[i + 1], 2)}: "
            f"{round(residual_value, 2)}"
        )

    return residuals_of_regions


def generate_highest_chi_square_feedback(chi_squares_of_regions, q_ranges):
    """
    Determines the q-region with the highest chi-square value.

    Returns a tuple with an error code and a report string:
    - "low_q_err" if the highest is chi_squares_of_regions[0]
    - "mid_q_err" if the highest is chi_squares_of_regions[1]
    - "high_q_err" if the highest is chi_squares_of_regions[2]
    - "no_q_err" if the highest chi-square value is <= CHI2_CUTOFF_MODERATE

    Args:
        chi_squares_of_regions (list): List of chi-square values for different regions.
        q_ranges (list): List of q-range boundaries.

    Returns:
        tuple: (error_code, report_string)
    """

    highest_cs_value = max(chi_squares_of_regions)
    i = chi_squares_of_regions.index(highest_cs_value)
    q_lower_bound = q_ranges[i]
    q_upper_bound = q_ranges[i + 1]

    highest_chi_square_feedback = (
        f"The chi-square is highest ({round(highest_cs_value, 2)}) "
        f"in the region where ({round(q_lower_bound, 2)} < q < {round(q_upper_bound, 2)})."
    )

    print_debug(highest_chi_square_feedback)

    if highest_cs_value > CHI2_CUTOFF_MODERATE:
        error_code = {0: "low_q_err", 1: "mid_q_err", 2: "high_q_err"}.get(
            i, f"region_{i}_err"
        )
        return error_code, highest_chi_square_feedback

    highest_chi_square_feedback = (
        f"The chi-square is highest ({round(highest_cs_value, 2)}) in the "
        f"region where {round(q_lower_bound, 2)} < q < {round(q_upper_bound, 2)}, "
        "but this is okay."
    )
    print_debug(highest_chi_square_feedback)
    return "no_q_err", highest_chi_square_feedback


def generate_second_highest_chi_square_feedback(chi_squares_of_regions, q_ranges):
    """
    Determines if the q-region with the second highest chi-square value is > CHI2_CUTOFF_MODERATE.

    Returns a tuple with an error code and a report string:
    - "low_q_err" if the 2nd highest is chi_squares_of_regions[0]
    - "mid_q_err" if the 2nd highest is chi_squares_of_regions[1]
    - "high_q_err" if the 2nd highest is chi_squares_of_regions[2]
    - "no_q_err" if the 2nd highest chi-square value is <= CHI2_CUTOFF_MODERATE

    Args:
        chi_squares_of_regions (list): List of chi-square values for different regions.
        q_ranges (list): List of q-range boundaries.

    Returns:
        tuple: (error_code, report_string)
    """

    # Sort the chi-square values to find the second highest
    chisquare_all_regions_sorted = sorted(copy.deepcopy(chi_squares_of_regions))
    second_highest_cs_value = chisquare_all_regions_sorted[-2]

    # Find the index of the second highest chi-square value
    i = chi_squares_of_regions.index(second_highest_cs_value)
    q_lower_bound = q_ranges[i]
    q_upper_bound = q_ranges[i + 1]

    # Generate the report string for the second highest chi-square value
    second_highest_chi_square_feedback = (
        f"The chi-square is also high ({round(second_highest_cs_value)}) "
        f"in the region where ({round(q_lower_bound, 2)} < q < {round(q_upper_bound, 2)})."
    )

    print_debug(second_highest_chi_square_feedback)

    # Check if the second highest chi-square value exceeds the moderate cutoff
    if second_highest_cs_value > CHI2_CUTOFF_MODERATE:
        error_code = {0: "low_q_err", 1: "mid_q_err", 2: "high_q_err"}.get(
            i, f"region_{i}_err"
        )
        return error_code, second_highest_chi_square_feedback

    # Generate the report string if the second highest chi-square value is acceptable
    second_highest_chi_square_feedback = (
        f"The 2nd highest chi-square ({round(second_highest_cs_value, 2)}) "
        f"is in the region where {round(q_lower_bound, 2)} < q < {round(q_upper_bound, 2)}, "
        "but this is okay."
    )
    print_debug(second_highest_chi_square_feedback)
    return "no_q_err", second_highest_chi_square_feedback


def all_regions_chi_square_good(chi_squares_of_regions):
    """
    Checks if all chi-squares of regions are < CHI2_CUTOFF_MODERATE
    """
    return all(cs < CHI2_CUTOFF_MODERATE for cs in chi_squares_of_regions)


def check_high_q_noise(chi_squares_of_regions):
    """
    Returns "high_noise" if the chi-square of the highest q-region is < 0.5.

    If the fit is good, but chi-square is < 0.5 in high-q, this suggests high noise in the sample.

    Args:
        chi_squares_of_regions (list): List of chi-square values for different regions.

    Returns:
        str: "high_noise" if the condition is met, otherwise None.
    """
    highest_q_region_chi_square = chi_squares_of_regions[-1]

    if highest_q_region_chi_square < 0.5:
        return "high_noise"

    return None


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="A script that evaluates the fit of a BilboMD job"
    )
    parser.add_argument("results", help="results folder from BilboMD job")
    return parser.parse_args()


def load_multi_state_models(folder):
    """Load and return all multi-state models from the results folder."""
    return sorted(glob.glob(folder + "/multi_state_model_*", recursive=True))


def load_ensemble_model_files(folder):
    """Load and return all ensemble_size_#_model.pdb files from the results folder."""
    return sorted(glob.glob(folder + "/ensemble_size_*.pdb", recursive=True))


def calculate_chi_squares(models):
    """Calculate chi-square for each model."""
    chi_square_of_models = []
    for model in models:
        profile = load_file(model)
        model_chi_square = calculate_chi_square(profile[0], profile[1])
        chi_square_of_models.append(model_chi_square)
    return chi_square_of_models


def evaluate_model_fit(eprof, mprof, q_ranges, mw_model):
    """Perform MW Bayesian calculation, chi-square analysis, and gather feedback."""
    mw_exp = mw_bayes(eprof)
    mw_err = abs((mw_exp - mw_model) / mw_model)
    overall_chi_square = calculate_chi_square(eprof, mprof)
    print_debug(f"Overall chi-square: {round(overall_chi_square, 2)} MW: {mw_exp}")

    chi_squares_of_regions = calculate_regional_chi_square_values(
        q_ranges, eprof, mprof
    )
    residuals_of_regions = calculate_regional_residual_values(q_ranges, eprof, mprof)

    feedback = generate_feedback(
        mw_exp, mw_model, mw_err, overall_chi_square, chi_squares_of_regions, q_ranges
    )

    evaluation_results = {
        "e_mw": mw_exp,
        "m_mw": mw_model,
        "mw_err": mw_err,
        "overall_chi_square": overall_chi_square,
        "chi_squares_of_regions": chi_squares_of_regions,
        "residuals_of_regions": residuals_of_regions,
        "feedback": feedback,
    }

    return evaluation_results


def generate_feedback(
    e_mw, m_mw, mw_err, overall_chi_square, chi_squares_of_regions, q_ranges
):
    """Generate feedback based on MW and chi-square analysis."""
    mw_feedback = generate_mw_feedback(e_mw, m_mw, mw_err)
    overall_chi_square_feedback = generate_overall_chi_square_feedback(
        overall_chi_square, mw_err
    )
    highest_chi_square_flag, highest_chi_square_feedback = (
        generate_highest_chi_square_feedback(chi_squares_of_regions, q_ranges)
    )
    second_highest_chi_square_flag, second_highest_chi_square_feedback = (
        generate_second_highest_chi_square_feedback(chi_squares_of_regions, q_ranges)
    )
    regional_chi_square_feedback = generate_regional_feedback(
        overall_chi_square,
        highest_chi_square_flag,
        second_highest_chi_square_flag,
        mw_err,
        chi_squares_of_regions,
    )
    print_debug(f"Regional feedback: {regional_chi_square_feedback}")

    return {
        "mw_feedback": mw_feedback,
        "overall_chi_square_feedback": overall_chi_square_feedback,
        "highest_chi_square_feedback": highest_chi_square_feedback,
        "second_highest_chi_square_feedback": second_highest_chi_square_feedback,
        "regional_chi_square_feedback": regional_chi_square_feedback,
    }


def generate_mw_feedback(e_mw, m_mw, mw_err):
    """Return feedback for MW error."""
    if mw_err > MW_ERR_CUTOFF:
        return (
            f"The difference between the model MW ({m_mw}) and the "
            f"SAXS MW ({e_mw}) is large ({round(100 * mw_err, 1)}%), "
            "sequence or oligomerization state is likely incorrect."
        )
    return (
        f"The difference between the model MW ({m_mw}) and the "
        f"SAXS MW ({e_mw}) is within acceptable error "
        f"({round(100 * mw_err, 1)}%)."
    )


def generate_overall_chi_square_feedback(overall_chi_square, mw_err):
    """Generate feedback based on overall chi-square value and MW error."""
    if mw_err > MW_ERR_CUTOFF:
        return (
            f"The overall chi-square of this fit is {round(overall_chi_square, 2)}. "
            "Please examine your sequence or oligomerization state."
        )

    if overall_chi_square < CHI2_CUTOFF_EXCELLENT:
        return (
            f"The overall chi-square of this fit is {round(overall_chi_square, 2)}. "
            "Excellent."
        )
    if overall_chi_square < CHI2_CUTOFF_MODERATE:
        return (
            f"The overall chi-square of this fit is {round(overall_chi_square, 2)}. "
            "Moderate."
        )
    return (
        f"The overall chi-square of this fit is {round(overall_chi_square, 2)}. "
        "Poor."
    )


def generate_regional_feedback(
    overall_chi_square: float,
    highest_chi_square_flag: str,
    second_highest_chi_square_flag: str,
    mw_err: float,
    chi_squares_of_regions: list,
) -> str:
    """Generate feedback based on chi-square analysis in different q regions."""

    if mw_err > MW_ERR_CUTOFF:
        return "Please revisit sequence and oligomerization state before examining flexibility."

    if all_regions_chi_square_good(chi_squares_of_regions):
        return "The model has a low chi-square throughout all q-ranges and is a good fit overall."

    # Excellent Fit Case: overall_chi_square < CHI2_CUTOFF_EXCELLENT
    if overall_chi_square < CHI2_CUTOFF_EXCELLENT:
        return handle_excellent_fit(highest_chi_square_flag, chi_squares_of_regions)

    # Moderate Fit Case: overall_chi_square < CHI2_CUTOFF_MODERATE
    if overall_chi_square < CHI2_CUTOFF_MODERATE:
        return handle_moderate_fit(
            highest_chi_square_flag, second_highest_chi_square_flag
        )

    # Poor Fit Case: overall_chi_square > CHI2_CUTOFF_MODERATE
    return handle_poor_fit(highest_chi_square_flag, second_highest_chi_square_flag)


def handle_excellent_fit(
    highest_chi_square_flag: str, chi_squares_of_regions: list
) -> str:
    """
    Handles feedback when the fit is excellent (overall chi-square < CHI2_CUTOFF_EXCELLENT).
    """
    if highest_chi_square_flag == "low_q_err":
        return (
            "Overall fit is good, but some error may come from detector artifacts "
            "or oligomerization states in the sample."
        )
    if highest_chi_square_flag == "mid_q_err":
        return (
            "Overall fit is good, but flexibility of elongated regions could be "
            "improved. Try increasing flexibility to see if that helps."
        )
    if highest_chi_square_flag == "high_q_err":
        feedback = (
            "Overall fit is good, though there may be a small amount of error in "
            "the buffer subtraction."
        )
        if check_high_q_noise(chi_squares_of_regions) == "high_noise":
            feedback += (
                f" Additionally, chi-square in the high-q region is very low "
                f"({round(chi_squares_of_regions[-1], 2)}). Though the model fits "
                "well, the data are very noisy."
            )
        return feedback
    return "Overall fit is excellent."


def handle_moderate_fit(
    highest_chi_square_flag: str, second_highest_chi_square_flag: str
) -> str:
    """
    Handles feedback when the fit is moderate (overall chi-square < CHI2_CUTOFF_MODERATE).
    """
    feedback = ""
    if highest_chi_square_flag == "low_q_err":
        feedback = (
            "The overall structure of the PDB model needs improvement. This may come "
            "from a sequence that is off, or the presence of oligomerization states "
            "in the sample."
        )
        if second_highest_chi_square_flag == "mid_q_err":
            feedback += (
                " Flexibility of elongated regions must also be increased. Try "
                "adjusting the flexible regions in the const.inp file using the PAE "
                "Jiffy."
            )
        elif second_highest_chi_square_flag == "high_q_err":
            feedback += " Buffer subtraction problems may have also occurred."
    elif highest_chi_square_flag == "mid_q_err":
        feedback = (
            "Flexibility of elongated regions must be increased, but you are close to "
            "a good fit. Try adjusting the flexible regions in the const.inp file."
        )
        if second_highest_chi_square_flag == "low_q_err":
            feedback += (
                " The sequence and oligomerization states are also not a good fit and "
                "should be revisited."
            )
        elif second_highest_chi_square_flag == "high_q_err":
            feedback += " Buffer subtraction problems may have also occurred."
    elif highest_chi_square_flag == "high_q_err":
        feedback = (
            "There are likely problems with buffer subtraction. Try re-analyzing the "
            "SAXS and scaling the buffer intensity."
        )
        if second_highest_chi_square_flag == "low_q_err":
            feedback += (
                " The sequence and oligomerization states should also be revisited."
            )
        elif second_highest_chi_square_flag == "mid_q_err":
            feedback += (
                " Flexibility of elongated regions must also be increased. Try "
                "adjusting the flexible regions in the const.inp file using the PAE "
                "Jiffy."
            )
    else:
        feedback = (
            "Something is wrong. The overall chi-square is > 2, but all q-regions "
            "have chi-square < 2? Please revisit the fit."
        )
    return feedback


def handle_poor_fit(
    highest_chi_square_flag: str, second_highest_chi_square_flag: str
) -> str:
    """
    Handles feedback when the fit is poor (overall chi-square > CHI2_CUTOFF_MODERATE).
    """
    feedback = ""
    if highest_chi_square_flag == "low_q_err":
        feedback = (
            "Between the model and experiment, there is likely a large difference in "
            "sequence, oligomerization, etc."
        )
        if second_highest_chi_square_flag == "mid_q_err":
            feedback += (
                " The movement of flexible regions in the model also do not seem to "
                "improve the fitting."
            )
        elif second_highest_chi_square_flag == "high_q_err":
            feedback += " There are also background subtraction problems."
    elif highest_chi_square_flag == "mid_q_err":
        feedback = (
            "The flexible regions in the model cannot find a fit with the SAXS. Try "
            "adjusting the flexible regions in the const.inp file using the PAE Jiffy."
        )
        if second_highest_chi_square_flag == "low_q_err":
            feedback += (
                " The overall structure and oligomerization states are also likely "
                "wrong."
            )
        elif second_highest_chi_square_flag == "high_q_err":
            feedback += " There are also background subtraction problems."
    elif highest_chi_square_flag == "high_q_err":
        feedback = "Buffer subtraction is incorrect."
        if second_highest_chi_square_flag == "low_q_err":
            feedback += (
                " The overall structure and oligomerization states are also likely "
                "wrong."
            )
        elif second_highest_chi_square_flag == "mid_q_err":
            feedback += (
                " The movement of flexible regions in the model also do not seem to "
                "improve the fitting."
            )
    else:
        feedback = (
            f"Something is wrong. The overall chi-square is > {CHI2_CUTOFF_MODERATE}, "
            f"but all q-regions have chi-square < {CHI2_CUTOFF_MODERATE}? "
            "Please revisit the fit or talk to a beamline scientist."
        )
    return feedback


def save_to_json(output_dict, filename="feedback.json"):
    """Save the output dictionary to a JSON file."""
    with open(filename, "w", encoding="utf-8") as outfile:
        json.dump(output_dict, outfile, indent=4)
    print_debug(f"JSON data saved to {filename}")


def main():
    """
    Main function to run the decision tree
    """

    args = parse_args()

    multi_state_models = load_multi_state_models(args.results)
    ensemble_pdb_files = load_ensemble_model_files(args.results)

    if not multi_state_models:
        raise FileNotFoundError("No multi-state models found in the specified folder")

    cs_models = calculate_chi_squares(multi_state_models)

    # Load best chi-square model
    best_model_idx = best_chi_square_i(cs_models, multi_state_models)

    print_debug("multi_state_model_*.dat files:")
    for model in multi_state_models:
        filename = os.path.basename(model)
        print_debug(filename)
    print_debug("ensemble_size_#_model.pdb files:")
    # for ensemble in ensemble_pdb_files:
    #     mw = calculate_molecular_weight(ensemble)
    #     filename = os.path.basename(ensemble)
    #     print(filename, mw)

    # Extract the best model filename

    best_model_dat_file = os.path.basename(multi_state_models[best_model_idx])

    # Assume that teh first file in this array is the 1-state model
    single_model_ensemble = ensemble_pdb_files[0]
    best_ensemble_pdb_file = os.path.basename(single_model_ensemble)

    mw_model = round(calculate_molecular_weight(single_model_ensemble) / 1000, 2)
    print_debug(
        f"Best ensemble model: {os.path.basename(single_model_ensemble)}, MW: {mw_model}"
    )
    profs = load_file(multi_state_models[best_model_idx])
    # Extract profiles and run evaluation
    eprof, mprof = profs[0], profs[1]

    q_min = eprof.getQ()[0]
    q_max = eprof.getQ()[-1]
    q_ranges = [q_min, 0.1, 0.2, q_max]

    # Evaluate fit and gather results
    evaluation_result = evaluate_model_fit(eprof, mprof, q_ranges, mw_model)

    # Prepare output data and save to JSON
    output_dict = {
        "mw_saxs": round(evaluation_result["e_mw"], 4),
        "mw_model": mw_model,
        "mw_err": round(evaluation_result["mw_err"], 4),
        "best_model_dat_file": best_model_dat_file,
        "best_ensemble_pdb_file": best_ensemble_pdb_file,
        "overall_chi_square": round(evaluation_result["overall_chi_square"], 2),
        "q_ranges": q_ranges,
        "chi_squares_of_regions": [
            round(cs, 2) for cs in evaluation_result["chi_squares_of_regions"]
        ],
        "residuals_of_regions": [
            round(res, 3) for res in evaluation_result["residuals_of_regions"]
        ],
        "mw_feedback": evaluation_result["feedback"]["mw_feedback"],
        "overall_chi_square_feedback": evaluation_result["feedback"][
            "overall_chi_square_feedback"
        ],
        "highest_chi_square_feedback": evaluation_result["feedback"][
            "highest_chi_square_feedback"
        ],
        "second_highest_chi_square_feedback": evaluation_result["feedback"][
            "second_highest_chi_square_feedback"
        ],
        "regional_chi_square_feedback": evaluation_result["feedback"][
            "regional_chi_square_feedback"
        ],
    }

    save_to_json(output_dict)


if __name__ == "__main__":
    main()
